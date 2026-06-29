import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabaseServer";
import { chatJSON } from "@/lib/groq";
import { computeCost } from "@/lib/cost";
import { BATCH_CONSISTENCY_SYSTEM, makeBatchConsistencyUser } from "@/lib/prompts";
import { BatchConsistencyOutputSchema } from "@/lib/types";
import { orchestrateClaim, type RepoData } from "@/lib/orchestrator";
import { search as serperSearch } from "@/lib/serper";
import pLimit from "p-limit";

export const maxDuration = 60;

const BATCH_SIZE = Number(process.env.SWARM_BATCH_SIZE ?? 5);
const POOL_SIZE  = Number(process.env.SWARM_POOL ?? 4);

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
    .select("id, name, github_handle, employers")
    .in("id", candidateIdsInBatch);

  const reposByCandidate = new Map<string, RepoData[]>();
  const handleByCandidate = new Map<string, string>();
  const nameByCandidate = new Map<string, string>();

  await Promise.all(
    (candidateRows ?? []).map(async (cand) => {
      if (cand.name) nameByCandidate.set(cand.id, cand.name);
      if (!cand.github_handle) return;
      handleByCandidate.set(cand.id, cand.github_handle);
      const repos = await fetchGithubRepos(cand.github_handle);
      reposByCandidate.set(cand.id, repos.map(toRepoData));
    })
  );

  // 3. Company context — use the LLM-extracted employers list per candidate to search
  //    for each company. Results are shared across both the consistency checker and
  //    individual claim agents (keyed by company name for per-claim lookup).
  const companySnippets = new Map<string, string>();        // company name → snippet text
  const companyContextByCandidate = new Map<string, string>(); // candidateId → combined block

  const employersByCandidate = new Map<string, string[]>();
  for (const row of candidateRows ?? []) {
    const employers: string[] = (row as { employers?: string[] }).employers ?? [];
    if (employers.length) employersByCandidate.set(row.id, employers);
  }

  // Search for every unique employer across the batch in parallel (serper has in-process cache)
  const allEmployers = [...new Set([...employersByCandidate.values()].flat().filter(Boolean))];
  await Promise.all(
    allEmployers.map(async (company) => {
      const results = await serperSearch(`"${company}" company employees headcount funding stage`, 2);
      if (!results.length) return;
      companySnippets.set(company, results.map((r) => `  - ${r.snippet}`).join("\n"));
    })
  );

  // Build per-candidate context block (all employers combined)
  for (const [candidateId, employers] of employersByCandidate) {
    const blocks = employers
      .map((c) => { const s = companySnippets.get(c); return s ? `${c}:\n${s}` : null; })
      .filter(Boolean) as string[];
    if (blocks.length) companyContextByCandidate.set(candidateId, blocks.join("\n\n"));
  }

  // 4. Batch consistency check — one LLM call per candidate with INTERNAL claims
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

  for (const [candidateId, internalClaims] of internalClaimsByCandidate) {
    const input = internalClaims.map((c, i) => ({ index: i, text: c.text }));
    const companyContext = companyContextByCandidate.get(candidateId);
    const { data: result, tokens, model } = await chatJSON(
      BatchConsistencyOutputSchema,
      BATCH_CONSISTENCY_SYSTEM,
      makeBatchConsistencyUser(input, companyContext),
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
          verdict: v.verdict as string,
          confidence: v.confidence,
          reasoning: result.overall_pattern
            ? `[Pattern: ${result.overall_pattern}] ${v.reasoning}`
            : v.reasoning,
          model,
        });
      }
    }
  }

  // ── Swarm pool — claims run in parallel up to POOL_SIZE ──────────────────
  // No serial gap gate — 429s are handled by callWithRetry (parses retry-after)
  // and Gemini fallback in chatJSON. Pool size is the only concurrency control.

  const pool = pLimit(POOL_SIZE);
  let totalInputTokens  = batchInputTokens;
  let totalOutputTokens = batchOutputTokens;
  let totalCostUsd      = computeCost(batchInputTokens, batchOutputTokens).costUsd;
  let processed = 0;

  await Promise.all(
    claimedClaims.map((claim) =>
      pool(async () => {

        try {
          const claimCompany: string | null = (claim as { company?: string | null }).company ?? null;
          const companyContext = claimCompany ? companySnippets.get(claimCompany) ?? null : null;

          const result = await orchestrateClaim({
            claimText: claim.text,
            claimType: claim.claim_type,
            candidateName: nameByCandidate.get(claim.candidate_id),
            allCandidateClaims: allClaimsByCandidate.get(claim.candidate_id) ?? [],
            githubHandle: handleByCandidate.get(claim.candidate_id) ?? null,
            githubRepos: reposByCandidate.get(claim.candidate_id),
            precomputedVerdict: batchVerdictMap.get(claim.id) ?? null,
            companyContext,
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
