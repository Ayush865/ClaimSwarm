import { z } from "zod";

// ─── Database types ───────────────────────────────────────────────────────────

export type JobStatus =
  | "created"
  | "extracting"
  | "verifying"
  | "scoring"
  | "done"
  | "error";

export type ClaimType = "PUBLIC_VERIFIABLE" | "INTERNAL_UNVERIFIABLE" | "GITHUB_VERIFIABLE";
export type ClaimStatus = "pending" | "running" | "done" | "error";
export type Verdict =
  | "SUPPORTED"
  | "REFUTED"
  | "UNVERIFIABLE"
  | "SUSPICIOUS";
export type Importance = "high" | "medium" | "low";

export interface Job {
  id: string;
  user_id: string;
  label: string | null;
  source: "upload" | "synthetic";
  status: JobStatus;
  total_candidates: number;
  total_claims: number;
  claims_done: number;
  cost_usd: number;
  tokens_used: number;
  created_at: string;
}

export interface Candidate {
  id: string;
  job_id: string;
  name: string | null;
  github_handle: string | null;
  storage_path: string | null;
  raw_text: string | null;
  trust_score: number | null;
  trust_summary: string | null;
  status: "pending" | "extracted" | "scored";
  github_evidence: GithubEvidence[] | null;
  created_at: string;
}

export interface EvidenceItem {
  snippet: string;
  url: string;
  source: string;
}

export interface Claim {
  id: string;
  candidate_id: string;
  job_id: string;
  text: string;
  claim_type: ClaimType;
  importance: Importance;
  status: ClaimStatus;
  verdict: Verdict | null;
  confidence: number | null;
  reasoning: string | null;
  evidence: EvidenceItem[] | null;
  model: string | null;
  tokens: number | null;
  expected_verdict: Verdict | null;
  created_at: string;
  updated_at: string;
}

export interface Metrics {
  id: number;
  job_id: string;
  t: string;
  claims_done: number;
  cost_usd: number;
  active_agents: number;
}

export interface GithubEvidence {
  repo: string;
  corroborates: boolean;
  evidence: string;
  confidence: number;
}

// ─── Zod schemas for agent outputs ───────────────────────────────────────────

export const ExtractedClaimSchema = z.object({
  text: z.string().min(5),
  claim_type: z.enum(["PUBLIC_VERIFIABLE", "INTERNAL_UNVERIFIABLE", "GITHUB_VERIFIABLE"]),
  importance: z.enum(["high", "medium", "low"]),
});

export const ExtractorOutputSchema = z.object({
  candidate_name: z.string().optional(),
  github_handle: z.string().nullable().optional(),
  claims: z.array(ExtractedClaimSchema).min(1),
});

export type ExtractorOutput = z.infer<typeof ExtractorOutputSchema>;

export const VerifierOutputSchema = z.object({
  verdict: z.enum(["SUPPORTED", "REFUTED", "UNVERIFIABLE", "SUSPICIOUS"]),
  confidence: z.number().min(0).max(1),
  evidence: z
    .preprocess(
      (val) => {
        if (!Array.isArray(val)) return [];
        return val.map((item) =>
          typeof item === "string"
            ? { snippet: item, url: "", source: "" }
            : item
        );
      },
      z.array(
        z.object({
          snippet: z.string().default(""),
          url: z.string().default(""),
          source: z.string().default(""),
        })
      )
    )
    .default([]),
  reasoning: z.string(),
});

export type VerifierOutput = z.infer<typeof VerifierOutputSchema>;

export const AggregatorOutputSchema = z.object({
  summary: z.string().max(300),
});

export const GithubAgentOutputSchema = z.object({
  corroborates: z.boolean(),
  evidence: z.string(),
  confidence: z.number().min(0).max(1),
});

export const BatchConsistencyItemSchema = z.object({
  index: z.number().int(),
  verdict: z.enum(["SUSPICIOUS", "UNVERIFIABLE"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export const BatchConsistencyOutputSchema = z.object({
  verdicts: z.array(BatchConsistencyItemSchema),
  overall_pattern: z.string().nullable().optional(),
});

// ─── API response types ───────────────────────────────────────────────────────

export interface RunBatchResponse {
  processed: number;
  remaining: number;
  costUsd: number;
}

export interface EvalResponse {
  precision: number;
  recall: number;
  f1: number;
  matrix: { tp: number; fp: number; fn: number; tn: number };
  total: number;
  misclassified: Claim[];
}

export interface TrustScoreBreakdown {
  score: number;
  refuted_high: number;
  refuted_medium: number;
  refuted_low: number;
  suspicious: number;
  supported_high: number;
  unverifiable: number;
}
