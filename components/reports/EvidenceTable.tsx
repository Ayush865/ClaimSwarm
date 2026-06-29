"use client";

import { VerdictChip } from "./VerdictChip";
import { ExternalLink, MessageSquare, Loader2 } from "lucide-react";
import { useState } from "react";
import type { Claim } from "@/lib/types";
import { cn } from "@/lib/utils";

interface EvidenceTableProps {
  claims: Claim[];
}

function getImportanceColor(imp: string) {
  if (imp === "high") return "text-foreground font-medium";
  if (imp === "medium") return "text-muted-foreground";
  return "text-muted-foreground/60";
}

function getConfidenceColor(conf: number) {
  if (conf >= 0.7) return "bg-emerald-500";
  if (conf >= 0.4) return "bg-amber-500";
  return "bg-red-500";
}

function ClaimCard({ claim }: { claim: Claim }) {
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAsk = claim.status === "done" && (claim.verdict === "SUSPICIOUS" || claim.verdict === "REFUTED");

  async function generateQuestions() {
    if (questions || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/claims/${claim.id}/questions`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate questions");
      const data = await res.json();
      setQuestions(data.questions);
    } catch {
      setError("Could not generate questions. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={cn(
        "border border-border rounded-lg p-4 space-y-3 transition-colors",
        claim.verdict === "REFUTED" && "border-red-500/20 bg-red-500/5",
        claim.verdict === "SUSPICIOUS" && "border-amber-500/20 bg-amber-500/5",
        claim.verdict === "SUPPORTED" && "border-emerald-500/10",
      )}
    >
      {/* Claim text + verdict */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm leading-relaxed", getImportanceColor(claim.importance))}>
            {claim.text}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <VerdictChip verdict={claim.verdict} status={claim.status} />
          <span className="text-xs text-muted-foreground capitalize">{claim.importance}</span>
        </div>
      </div>

      {/* Confidence + reasoning */}
      {claim.status === "done" && (
        <>
          {claim.confidence !== null && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-20 shrink-0">Confidence</span>
              <div className="flex-1 relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={cn("absolute left-0 top-0 h-full rounded-full transition-all duration-500", getConfidenceColor(claim.confidence))}
                  style={{ width: `${Math.round(claim.confidence * 100)}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">
                {Math.round(claim.confidence * 100)}%
              </span>
            </div>
          )}

          {claim.reasoning && (
            <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-3">
              {claim.reasoning}
            </p>
          )}

          {/* Evidence links */}
          {claim.evidence && Array.isArray(claim.evidence) && claim.evidence.length > 0 && (
            <div className="space-y-1.5">
              {claim.evidence.slice(0, 3).map((ev, i) => (
                <a
                  key={i}
                  href={ev.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 text-xs text-blue-400 hover:text-blue-300 transition-colors group"
                >
                  <ExternalLink className="w-3 h-3 mt-0.5 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  <span className="line-clamp-1">{ev.snippet || ev.url}</span>
                </a>
              ))}
            </div>
          )}

          {/* Agent type + model */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground/60 flex-wrap">
            <span className="border border-border/50 rounded px-1.5 py-0.5 flex items-center gap-1">
              {claim.claim_type === "GITHUB_VERIFIABLE" ? (
                <><span>🐙</span> GitHub Agent</>
              ) : claim.claim_type === "PUBLIC_VERIFIABLE" ? (
                <><span>🔍</span> Web Search Agent</>
              ) : (
                <><span>🔄</span> Consistency Agent</>
              )}
            </span>
            {claim.model && (
              <span className="border border-border/50 rounded px-1.5 py-0.5 font-mono">
                {claim.model}
              </span>
            )}
            {claim.tokens != null && (
              <span className="text-muted-foreground/40">{claim.tokens} tokens</span>
            )}
          </div>

          {/* Interview questions — only for flagged claims */}
          {canAsk && (
            <div className={cn(
              "rounded-md border transition-colors",
              claim.verdict === "REFUTED" ? "border-red-500/20" : "border-amber-500/20",
            )}>
              {!questions ? (
                <button
                  onClick={generateQuestions}
                  disabled={loading}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors",
                    claim.verdict === "REFUTED"
                      ? "text-red-400 hover:bg-red-500/10"
                      : "text-amber-400 hover:bg-amber-500/10",
                    loading && "opacity-60 cursor-not-allowed",
                  )}
                >
                  {loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                  )}
                  {loading ? "Generating questions…" : "Suggested interview questions →"}
                </button>
              ) : (
                <div className="px-3 py-2.5 space-y-2">
                  <div className={cn(
                    "flex items-center gap-1.5 text-xs font-medium mb-1",
                    claim.verdict === "REFUTED" ? "text-red-400" : "text-amber-400",
                  )}>
                    <MessageSquare className="w-3.5 h-3.5" />
                    Ask the candidate
                  </div>
                  <ol className="space-y-2">
                    {questions.map((q, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
                        <span className={cn(
                          "shrink-0 font-mono font-bold mt-0.5",
                          claim.verdict === "REFUTED" ? "text-red-400/60" : "text-amber-400/60",
                        )}>
                          {i + 1}.
                        </span>
                        {q}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {error && (
                <p className="px-3 pb-2 text-xs text-red-400">{error}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function EvidenceTable({ claims }: EvidenceTableProps) {
  if (!claims.length) {
    return <p className="text-sm text-muted-foreground py-4">No claims to display.</p>;
  }

  const sorted = [...claims].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.importance as keyof typeof order] ?? 2) - (order[b.importance as keyof typeof order] ?? 2);
  });

  return (
    <div className="space-y-3">
      {sorted.map((claim) => (
        <ClaimCard key={claim.id} claim={claim} />
      ))}
    </div>
  );
}
