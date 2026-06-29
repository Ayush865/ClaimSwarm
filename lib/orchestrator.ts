/**
 * Per-claim orchestrator.
 *
 * A claim can trigger 1 or more agents depending on its type and available context.
 * The orchestrator runs agents (in parallel where possible), then merges their
 * verdicts into a single authoritative result.
 *
 * Routing:
 *   PUBLIC_VERIFIABLE   → Web pipeline (always) + GitHub agent (if repos available)
 *   GITHUB_VERIFIABLE   → Web pipeline (always) + GitHub agent (always, since handle exists)
 *   INTERNAL_UNVERIFIABLE → reads pre-computed batch consistency verdict (no extra LLM call)
 *                           falls back to single-claim consistency check if not pre-computed
 *
 * Web pipeline = Query Writer (fast) → Serper search → Web Verifier (reasoning)
 * GitHub agent = GitHub Verifier (balanced)
 */

import { chatJSON } from "./groq";
import { search } from "./serper";
import { computeCost } from "./cost";
import {
  QUERY_WRITER_SYSTEM,
  makeQueryWriterUser,
  VERIFIER_PUBLIC_SYSTEM,
  makeVerifierPublicUser,
  GITHUB_VERIFIER_SYSTEM,
  makeGithubVerifierUser,
  VERIFIER_INTERNAL_SYSTEM,
  makeVerifierInternalUser,
} from "./prompts";
import { QueryWriterOutputSchema, VerifierOutputSchema } from "./types";
import type { ClaimType, Verdict, EvidenceItem } from "./types";

// ── Shared types ──────────────────────────────────────────────────────────────

export interface RepoData {
  name: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  topics: string[];
  owner_login: string;
}

export interface ClaimContext {
  claimText: string;
  claimType: ClaimType;
  candidateName?: string;           // used by query writer for award/authorship queries
  allCandidateClaims: string[];    // all claim texts for this candidate (consistency check)
  githubHandle?: string | null;
  githubRepos?: RepoData[];
  // Web-search snippets about the company this claim relates to (from LLM-extracted employers)
  companyContext?: string | null;
  // Supplied for INTERNAL claims — result of the batch consistency check run
  // before the swarm pool (one LLM call for all internal claims per candidate).
  precomputedVerdict?: {
    verdict: string;
    confidence: number;
    reasoning: string;
    model: string;
  } | null;
}

export interface OrchestratorResult {
  verdict: Verdict;
  confidence: number;
  evidence: EvidenceItem[];
  reasoning: string;
  model: string;        // "+"-joined list of model IDs used
  totalTokens: { input: number; output: number };
  agentsRun: number;
  costUsd: number;
}

interface AgentResult {
  source: "web" | "github" | "consistency";
  verdict: Verdict;
  confidence: number;
  evidence: EvidenceItem[];
  reasoning: string;
  model: string;
  tokens: { input: number; output: number };
}

const VERIFIER_FALLBACK = {
  verdict: "UNVERIFIABLE" as const,
  confidence: 0,
  evidence: [] as EvidenceItem[],
  reasoning: "Agent failed to produce a verdict.",
};

// ── Individual agents ─────────────────────────────────────────────────────────

async function runWebPipeline(claimText: string, candidateName?: string, companyContext?: string | null): Promise<AgentResult> {
  // Step 1 — Query Writer (fast): produce the best search query for this claim
  const { data: qw, tokens: qwTokens, model: qwModel } = await chatJSON(
    QueryWriterOutputSchema,
    QUERY_WRITER_SYSTEM,
    makeQueryWriterUser(claimText, candidateName),
    { query: claimText.replace(/^(I|we|my team)\s+/i, "").slice(0, 120) },
    15000,
    "fast"
  );

  // Step 2 — Serper: execute the optimized query
  const searchResults = await search(qw.query);

  // Step 3 — Web Verifier (reasoning): critically evaluate the search results
  // candidateName is passed so the model can match names in evidence against the candidate
  const { data: v, tokens: vTokens, model: vModel } = await chatJSON(
    VerifierOutputSchema,
    VERIFIER_PUBLIC_SYSTEM,
    makeVerifierPublicUser(claimText, searchResults, candidateName, companyContext ?? undefined),
    VERIFIER_FALLBACK,
    30000,
    "reasoning"
  );

  return {
    source: "web",
    verdict: v.verdict,
    confidence: v.confidence,
    evidence: v.evidence as EvidenceItem[],
    reasoning: `[query: "${qw.query}"] ${v.reasoning}`,
    model: `${qwModel}|${vModel}`,
    tokens: {
      input: qwTokens.input + vTokens.input,
      output: qwTokens.output + vTokens.output,
    },
  };
}

async function runGithubAgent(
  claimText: string,
  handle: string,
  repos: RepoData[]
): Promise<AgentResult> {
  const { data: v, tokens, model } = await chatJSON(
    VerifierOutputSchema,
    GITHUB_VERIFIER_SYSTEM,
    makeGithubVerifierUser(claimText, handle, repos),
    VERIFIER_FALLBACK,
    30000,
    "balanced"
  );

  return {
    source: "github",
    verdict: v.verdict,
    confidence: v.confidence,
    evidence: v.evidence as EvidenceItem[],
    reasoning: v.reasoning,
    model,
    tokens,
  };
}

// ── Verdict merging ───────────────────────────────────────────────────────────

function mergeAgentResults(agents: AgentResult[]): Omit<OrchestratorResult, "costUsd"> {
  const totalTokens = agents.reduce(
    (acc, a) => ({ input: acc.input + a.tokens.input, output: acc.output + a.tokens.output }),
    { input: 0, output: 0 }
  );
  const model = [...new Set(agents.map((a) => a.model))].join("+");
  const agentsRun = agents.length;

  const nonUnverifiable = agents.filter((a) => a.verdict !== "UNVERIFIABLE");

  if (nonUnverifiable.length === 0) {
    const best = agents.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
    return { verdict: "UNVERIFIABLE", confidence: best.confidence, evidence: best.evidence, reasoning: best.reasoning, model, totalTokens, agentsRun };
  }

  const refuted  = nonUnverifiable.filter((a) => a.verdict === "REFUTED");
  const supported = nonUnverifiable.filter((a) => a.verdict === "SUPPORTED");

  // Conflict: web and GitHub disagree
  if (refuted.length > 0 && supported.length > 0) {
    const topR = refuted.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
    const topS = supported.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
    const gap = topR.confidence - topS.confidence;

    if (gap >= 0.2) {
      return { verdict: "REFUTED", confidence: topR.confidence, evidence: topR.evidence, reasoning: `[Conflicting signals — REFUTED more confident] ${topR.reasoning}`, model, totalTokens, agentsRun };
    }
    if (gap <= -0.2) {
      return { verdict: "SUPPORTED", confidence: topS.confidence, evidence: [...topS.evidence, ...topR.evidence].slice(0, 4), reasoning: `[Conflicting signals — SUPPORTED more confident] ${topS.reasoning}`, model, totalTokens, agentsRun };
    }
    // Too close to call — flag for human review
    return {
      verdict: "SUSPICIOUS",
      confidence: Math.max(topR.confidence, topS.confidence) * 0.8,
      evidence: [...topR.evidence, ...topS.evidence].slice(0, 4),
      reasoning: `[Agents disagree] Web: ${topR.reasoning} | GitHub: ${topS.reasoning}`,
      model,
      totalTokens,
      agentsRun,
    };
  }

  if (refuted.length > 0) {
    const best = refuted.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
    return { verdict: "REFUTED", confidence: best.confidence, evidence: refuted.flatMap((r) => r.evidence).slice(0, 4), reasoning: best.reasoning, model, totalTokens, agentsRun };
  }

  // All SUPPORTED — merge evidence, small confidence boost per corroborating source
  const best = supported.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
  const boost = Math.min(0.05 * (supported.length - 1), 0.1);
  return {
    verdict: "SUPPORTED",
    confidence: Math.min(1, best.confidence + boost),
    evidence: supported.flatMap((s) => s.evidence).slice(0, 4),
    reasoning: supported.length > 1
      ? `[Corroborated by ${supported.length} sources] ${best.reasoning}`
      : best.reasoning,
    model,
    totalTokens,
    agentsRun,
  };
}

function agentCost(agent: AgentResult): number {
  return computeCost(agent.tokens.input, agent.tokens.output, agent.model).costUsd;
}

// ── Orchestrator entry point ──────────────────────────────────────────────────

export async function orchestrateClaim(ctx: ClaimContext): Promise<OrchestratorResult> {
  const { claimText, claimType, candidateName, githubHandle, githubRepos, precomputedVerdict } = ctx;

  // ── INTERNAL: consistency check ───────────────────────────────────────────
  if (claimType === "INTERNAL_UNVERIFIABLE") {
    if (precomputedVerdict) {
      // Fast path: batch pre-computation already ran before the pool
      return {
        verdict: precomputedVerdict.verdict as Verdict,
        confidence: precomputedVerdict.confidence,
        evidence: [],
        reasoning: precomputedVerdict.reasoning,
        model: precomputedVerdict.model,
        totalTokens: { input: 0, output: 0 },
        agentsRun: 1,
        costUsd: 0,
      };
    }

    // Fallback: single-claim consistency check (no batch context available)
    const { data: v, tokens, model } = await chatJSON(
      VerifierOutputSchema,
      VERIFIER_INTERNAL_SYSTEM,
      makeVerifierInternalUser(claimText, ctx.allCandidateClaims),
      VERIFIER_FALLBACK,
      30000,
      "reasoning"
    );
    // Enforce: internal claims can only be SUSPICIOUS or UNVERIFIABLE
    const safeVerdict = v.verdict === "SUPPORTED" || v.verdict === "REFUTED" ? "UNVERIFIABLE" : v.verdict;
    const { costUsd } = computeCost(tokens.input, tokens.output, model);
    return { verdict: safeVerdict, confidence: v.confidence, evidence: [], reasoning: v.reasoning, model, totalTokens: tokens, agentsRun: 1, costUsd };
  }

  // ── EXTERNAL: web + github in parallel ───────────────────────────────────
  const hasGithub = !!(githubHandle && githubRepos && githubRepos.length > 0);

  const tasks: Promise<AgentResult>[] = [runWebPipeline(claimText, candidateName, ctx.companyContext)];

  if (hasGithub) {
    tasks.push(runGithubAgent(claimText, githubHandle!, githubRepos!));
  }

  const results = await Promise.all(tasks);
  const merged = mergeAgentResults(results);

  // External claims cannot be SUSPICIOUS (that verdict is internal-only)
  if (merged.verdict === "SUSPICIOUS") {
    merged.verdict = "UNVERIFIABLE";
    merged.reasoning = `[Agents disagreed but neither decisive] ${merged.reasoning}`;
  }

  // A REFUTED verdict with very low confidence is unreliable — treat as UNVERIFIABLE
  // rather than surfacing a likely false positive to the recruiter.
  if (merged.verdict === "REFUTED" && merged.confidence < 0.4) {
    merged.verdict = "UNVERIFIABLE";
    merged.reasoning = `[Low-confidence refutation — insufficient evidence to flag] ${merged.reasoning}`;
  }

  const costUsd = results.reduce((acc, r) => acc + agentCost(r), 0);
  return { ...merged, costUsd };
}
