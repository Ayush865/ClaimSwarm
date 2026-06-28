import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabaseServer";
import { chatJSON } from "@/lib/groq";
import { search } from "@/lib/serper";
import { computeCost } from "@/lib/cost";
import {
  VERIFIER_PUBLIC_SYSTEM,
  VERIFIER_INTERNAL_SYSTEM,
  GITHUB_VERIFIER_SYSTEM,
  makeVerifierPublicUser,
  makeVerifierInternalUser,
  makeGithubVerifierUser,
} from "@/lib/prompts";
import { VerifierOutputSchema } from "@/lib/types";
import pLimit from "p-limit";

export const maxDuration = 60;

// Groq free tier: 6000 TPM, ~1100 tokens/request → max 5 req/min → 12s gap minimum.
// Using 13s to stay comfortably under. Override with env vars on paid tiers.
const BATCH_SIZE = Number(process.env.SWARM_BATCH_SIZE ?? 10);
const POOL_SIZE = Number(process.env.SWARM_POOL ?? 1);
const MIN_GAP_MS = Number(process.env.SWARM_GAP_MS ?? 13000);

const VERIFIER_FALLBACK = {
  verdict: "UNVERIFIABLE" as const,
  confidence: 0,
  evidence: [],
  reasoning: "Agent failed to produce a verdict.",
};

interface GithubRepo {
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string;
  topics: string[];
  owner: { login: string };
}

async function fetchGithubRepos(handle: string): Promise<GithubRepo[]> {
  try {
    const resp = await fetch(
      `https://api.github.com/users/${handle}/repos?sort=pushed&per_page=20`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );
    if (!resp.ok) return [];
    return resp.json();
  } catch {
    return [];
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: jobId } = await params;
  const db = createServerClient();

  const { data: job } = await db
    .from("jobs")
    .select("id, user_id, claims_done, cost_usd, tokens_used")
    .eq("id", jobId)
    .single();

  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.user_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Reset any claims orphaned in "running" state (e.g. from a server restart)
  await db
    .from("claims")
    .update({ status: "pending" })
    .eq("job_id", jobId)
    .eq("status", "running");

  // Atomically claim a batch of pending claims
  const { data: claimedClaims } = await db
    .from("claims")
    .update({ status: "running" })
    .eq("job_id", jobId)
    .eq("status", "pending")
    .limit(BATCH_SIZE)
    .select();

  if (!claimedClaims || claimedClaims.length === 0) {
    const { count } = await db
      .from("claims")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .eq("status", "pending");
    return NextResponse.json({ processed: 0, remaining: count ?? 0, costUsd: 0 });
  }

  // ── Pre-load per-candidate context ──────────────────────────────────────────

  // 1. All claims grouped by candidate (for internal consistency checker)
  const { data: allClaims } = await db
    .from("claims")
    .select("text, candidate_id")
    .eq("job_id", jobId);

  const claimsByCandidate = new Map<string, string[]>();
  for (const c of allClaims ?? []) {
    const arr = claimsByCandidate.get(c.candidate_id) ?? [];
    arr.push(c.text);
    claimsByCandidate.set(c.candidate_id, arr);
  }

  // 2. GitHub repos for candidates that have GITHUB_VERIFIABLE claims in this batch
  const githubCandidateIds = new Set(
    claimedClaims
      .filter((c) => c.claim_type === "GITHUB_VERIFIABLE")
      .map((c) => c.candidate_id)
  );

  const reposByCandidate = new Map<string, GithubRepo[]>();
  const handleByCandidate = new Map<string, string>();

  if (githubCandidateIds.size > 0) {
    const { data: candidateRows } = await db
      .from("candidates")
      .select("id, github_handle")
      .in("id", [...githubCandidateIds]);

    await Promise.all(
      (candidateRows ?? []).map(async (cand) => {
        if (!cand.github_handle) return;
        handleByCandidate.set(cand.id, cand.github_handle);
        const repos = await fetchGithubRepos(cand.github_handle);
        reposByCandidate.set(cand.id, repos);
      })
    );
  }

  // ── Swarm pool ───────────────────────────────────────────────────────────────

  const pool = pLimit(POOL_SIZE);
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let processed = 0;

  let lastCallAt = 0;

  await Promise.all(
    claimedClaims.map((claim) =>
      pool(async () => {
        // Enforce minimum gap between Groq calls to stay under free-tier RPM
        const now = Date.now();
        const wait = MIN_GAP_MS - (now - lastCallAt);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        lastCallAt = Date.now();

        try {
          let result;

          if (claim.claim_type === "PUBLIC_VERIFIABLE") {
            const searchResults = await search(buildSearchQuery(claim.text));
            result = await chatJSON(
              VerifierOutputSchema,
              VERIFIER_PUBLIC_SYSTEM,
              makeVerifierPublicUser(claim.text, searchResults),
              VERIFIER_FALLBACK
            );

          } else if (claim.claim_type === "GITHUB_VERIFIABLE") {
            const repos = reposByCandidate.get(claim.candidate_id) ?? [];
            const handle = handleByCandidate.get(claim.candidate_id);

            if (repos.length > 0 && handle) {
              // Run GitHub agent
              const repoData = repos.map((r) => ({
                name: r.name,
                description: r.description,
                language: r.language,
                stars: r.stargazers_count,
                forks: r.forks_count,
                topics: r.topics ?? [],
                owner_login: r.owner.login,
              }));
              result = await chatJSON(
                VerifierOutputSchema,
                GITHUB_VERIFIER_SYSTEM,
                makeGithubVerifierUser(claim.text, handle, repoData),
                VERIFIER_FALLBACK
              );
            } else {
              // No GitHub handle — fall back to web search
              const searchResults = await search(buildSearchQuery(claim.text));
              result = await chatJSON(
                VerifierOutputSchema,
                VERIFIER_PUBLIC_SYSTEM,
                makeVerifierPublicUser(claim.text, searchResults),
                VERIFIER_FALLBACK
              );
            }

          } else {
            // INTERNAL_UNVERIFIABLE — consistency check within candidate's own claims
            const candidateClaims = claimsByCandidate.get(claim.candidate_id) ?? [];
            result = await chatJSON(
              VerifierOutputSchema,
              VERIFIER_INTERNAL_SYSTEM,
              makeVerifierInternalUser(claim.text, candidateClaims),
              VERIFIER_FALLBACK
            );
          }

          const { data: verdict, tokens, model } = result;

          // Internal claims can only be SUSPICIOUS or UNVERIFIABLE
          if (claim.claim_type === "INTERNAL_UNVERIFIABLE") {
            if (verdict.verdict === "SUPPORTED" || verdict.verdict === "REFUTED") {
              verdict.verdict = "UNVERIFIABLE";
            }
          }

          await db
            .from("claims")
            .update({
              status: "done",
              verdict: verdict.verdict,
              confidence: verdict.confidence,
              reasoning: verdict.reasoning,
              evidence: verdict.evidence,
              model,
              tokens: tokens.input + tokens.output,
            })
            .eq("id", claim.id);

          totalInputTokens += tokens.input;
          totalOutputTokens += tokens.output;
          processed++;
        } catch (err) {
          console.error(`Claim ${claim.id} failed:`, err);
          await db.from("claims").update({ status: "error" }).eq("id", claim.id);
        }
      })
    )
  );

  const { costUsd, tokens: totalTokens } = computeCost(totalInputTokens, totalOutputTokens);

  await db
    .from("jobs")
    .update({
      claims_done: (job.claims_done ?? 0) + processed,
      cost_usd: Number(job.cost_usd ?? 0) + costUsd,
      tokens_used: Number(job.tokens_used ?? 0) + totalTokens,
    })
    .eq("id", jobId);

  await db.from("metrics").insert({
    job_id: jobId,
    claims_done: (job.claims_done ?? 0) + processed,
    cost_usd: Number(job.cost_usd ?? 0) + costUsd,
    active_agents: processed,
  });

  const { count: remaining } = await db
    .from("claims")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("status", "pending");

  return NextResponse.json({ processed, remaining: remaining ?? 0, costUsd });
}

function buildSearchQuery(claimText: string): string {
  return claimText
    .replace(/^(I|we|my team)\s+/i, "")
    .replace(/\b(approximately|about|around|over|more than)\b/gi, "")
    .slice(0, 120);
}
