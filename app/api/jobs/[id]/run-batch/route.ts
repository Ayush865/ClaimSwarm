import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabaseServer";
import { chatJSON } from "@/lib/groq";
import { computeCost } from "@/lib/cost";
import { BATCH_CONSISTENCY_SYSTEM, makeBatchConsistencyUser } from "@/lib/prompts";
import { BatchConsistencyOutputSchema } from "@/lib/types";
import { orchestrateClaim, type RepoData } from "@/lib/orchestrator";
import pLimit from "p-limit";

export const maxDuration = 60;

const BATCH_SIZE = Number(process.env.SWARM_BATCH_SIZE ?? 10);
const POOL_SIZE  = Number(process.env.SWARM_POOL ?? 1);
const MIN_GAP_MS = Number(process.env.SWARM_GAP_MS ?? 13000);

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

function toRepoData(r: GithubRepo): RepoData {
  return {
    name: r.name,
    description: r.description,
    language: r.language,
    stars: r.stargazers_count,
    forks: r.forks_count,
    topics: r.topics ?? [],
    owner_login: r.owner.login,
  };
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

  // ── Pre-load context (done once per batch, not per claim) ─────────────────

  // 1. All claim texts grouped by candidate (for the internal consistency check)
  const { data: allJobClaims } = await db
    .from("claims")
    .select("text, candidate_id")
    .eq("job_id", jobId);

  const allClaimsByCandidate = new Map<string, string[]>();
  for (const c of allJobClaims ?? []) {
    const arr = allClaimsByCandidate.get(c.candidate_id) ?? [];
    arr.push(c.text);
    allClaimsByCandidate.set(c.candidate_id, arr);
  }

  // 2. GitHub repos — pre-load for every candidate in this batch that has a handle.
  //    Both PUBLIC_VERIFIABLE and GITHUB_VERIFIABLE claims use GitHub when available.
  const candidateIdsInBatch = [...new Set(claimedClaims.map((c) => c.candidate_id))];

  const { data: candidateRows } = await db
    .from("candidates")
    .select("id, github_handle")
    .in("id", candidateIdsInBatch);

  const reposByCandidate = new Map<string, RepoData[]>();
  const handleByCandidate = new Map<string, string>();

  await Promise.all(
    (candidateRows ?? []).map(async (cand) => {
      if (!cand.github_handle) return;
      handleByCandidate.set(cand.id, cand.github_handle);
      const repos = await fetchGithubRepos(cand.github_handle);
      reposByCandidate.set(cand.id, repos.map(toRepoData));
    })
  );

  // 3. Batch consistency check — one LLM call per candidate with INTERNAL claims
  //    (more efficient and accurate than one call per internal claim)
  const internalClaimsByCandidate = new Map<string, typeof claimedClaims>();
  for (const claim of claimedClaims) {
    if (claim.claim_type === "INTERNAL_UNVERIFIABLE") {
      const arr = internalClaimsByCandidate.get(claim.candidate_id) ?? [];
      arr.push(claim);
      internalClaimsByCandidate.set(claim.candidate_id, arr);
    }
  }

  type PrecomputedVerdict = { verdict: string; confidence: number; reasoning: string; model: string };
  const batchVerdictMap = new Map<string, PrecomputedVerdict>();
  let batchInputTokens = 0;
  let batchOutputTokens = 0;

  for (const [, internalClaims] of internalClaimsByCandidate) {
    const input = internalClaims.map((c, i) => ({ index: i, text: c.text }));
    const { data: result, tokens, model } = await chatJSON(
      BatchConsistencyOutputSchema,
      BATCH_CONSISTENCY_SYSTEM,
      makeBatchConsistencyUser(input),
      { verdicts: [], overall_pattern: null },
      30000,
      "reasoning"
    );

    batchInputTokens  += tokens.input;
    batchOutputTokens += tokens.output;

    for (const v of result.verdicts) {
      const claim = internalClaims[v.index];
      if (claim) {
        batchVerdictMap.set(claim.id, {
          verdict: v.verdict,
          confidence: v.confidence,
          reasoning: result.overall_pattern
            ? `[Pattern: ${result.overall_pattern}] ${v.reasoning}`
            : v.reasoning,
          model,
        });
      }
    }
  }

  // ── Swarm pool — one orchestrator call per claim ──────────────────────────

  const pool = pLimit(POOL_SIZE);
  let lastCallAt = 0;
  let totalInputTokens  = batchInputTokens;
  let totalOutputTokens = batchOutputTokens;
  let totalCostUsd      = computeCost(batchInputTokens, batchOutputTokens).costUsd;
  let processed = 0;

  await Promise.all(
    claimedClaims.map((claim) =>
      pool(async () => {
        // Rate-limit gap only needed for external claims (internal reads from map)
        if (claim.claim_type !== "INTERNAL_UNVERIFIABLE") {
          const now = Date.now();
          const wait = MIN_GAP_MS - (now - lastCallAt);
          if (wait > 0) await new Promise((r) => setTimeout(r, wait));
          lastCallAt = Date.now();
        }

        try {
          const result = await orchestrateClaim({
            claimText: claim.text,
            claimType: claim.claim_type,
            allCandidateClaims: allClaimsByCandidate.get(claim.candidate_id) ?? [],
            githubHandle: handleByCandidate.get(claim.candidate_id) ?? null,
            githubRepos: reposByCandidate.get(claim.candidate_id),
            precomputedVerdict: batchVerdictMap.get(claim.id) ?? null,
          });

          await db
            .from("claims")
            .update({
              status: "done",
              verdict: result.verdict,
              confidence: result.confidence,
              reasoning: result.reasoning,
              evidence: result.evidence,
              model: result.model,
              tokens: result.totalTokens.input + result.totalTokens.output,
            })
            .eq("id", claim.id);

          totalInputTokens  += result.totalTokens.input;
          totalOutputTokens += result.totalTokens.output;
          totalCostUsd      += result.costUsd;
          processed++;
        } catch (err) {
          console.error(`Claim ${claim.id} failed:`, err);
          await db.from("claims").update({ status: "error" }).eq("id", claim.id);
        }
      })
    )
  );

  const totalTokens = totalInputTokens + totalOutputTokens;

  await db
    .from("jobs")
    .update({
      claims_done:  (job.claims_done  ?? 0) + processed,
      cost_usd:     Number(job.cost_usd    ?? 0) + totalCostUsd,
      tokens_used:  Number(job.tokens_used ?? 0) + totalTokens,
    })
    .eq("id", jobId);

  await db.from("metrics").insert({
    job_id: jobId,
    claims_done:   (job.claims_done ?? 0) + processed,
    cost_usd:      Number(job.cost_usd ?? 0) + totalCostUsd,
    active_agents: processed,
  });

  const { count: remaining } = await db
    .from("claims")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("status", "pending");

  return NextResponse.json({ processed, remaining: remaining ?? 0, costUsd: totalCostUsd });
}
