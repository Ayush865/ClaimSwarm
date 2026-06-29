"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Claim, ClaimStatus, Verdict } from "@/lib/types";

interface SwarmCellProps {
  claim: Claim;
}

function getCellStyle(status: ClaimStatus, verdict: Verdict | null) {
  if (status === "running") return "bg-blue-500 cell-running ring-1 ring-blue-400/50";
  if (status === "error") return "bg-slate-700/60 opacity-50";
  if (status === "pending") return "bg-slate-700/40";
  // done
  switch (verdict) {
    case "SUPPORTED": return "bg-emerald-500 hover:bg-emerald-400 ring-1 ring-emerald-400/30";
    case "REFUTED": return "bg-red-500 hover:bg-red-400 ring-1 ring-red-400/30";
    case "SUSPICIOUS": return "bg-amber-500 hover:bg-amber-400 ring-1 ring-amber-400/30";
    case "UNVERIFIABLE": return "bg-slate-500 hover:bg-slate-400 ring-1 ring-slate-400/30";
    default: return "bg-slate-600/50";
  }
}

function getVerdictVariant(verdict: Verdict | null) {
  switch (verdict) {
    case "SUPPORTED": return "supported";
    case "REFUTED": return "refuted";
    case "SUSPICIOUS": return "suspicious";
    case "UNVERIFIABLE": return "unverifiable";
    default: return "pending";
  }
}

function getStatusLabel(status: ClaimStatus, verdict: Verdict | null): string {
  if (status === "running") return "Verifying...";
  if (status === "pending") return "Pending";
  if (status === "error") return "Error";
  return verdict ?? "Unknown";
}

export function SwarmCell({ claim }: SwarmCellProps) {
  const isDone = claim.status === "done";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "w-6 h-6 rounded-sm cursor-pointer transition-all duration-200 shrink-0",
            getCellStyle(claim.status, claim.verdict)
          )}
          aria-label={`${getStatusLabel(claim.status, claim.verdict)}: ${claim.text.slice(0, 60)}`}
        />
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-xs p-3 space-y-2 bg-slate-900 border-slate-700"
      >
        <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
          {claim.text}
        </p>
        <div className="flex items-center gap-2">
          <Badge variant={getVerdictVariant(claim.verdict) as any}>
            {getStatusLabel(claim.status, claim.verdict)}
          </Badge>
          {isDone && claim.confidence !== null && (
            <span className="text-xs text-slate-400">
              {Math.round(claim.confidence * 100)}% confidence
            </span>
          )}
        </div>
        {isDone && claim.reasoning && (
          <p className="text-xs text-slate-400 italic line-clamp-2">
            {claim.reasoning}
          </p>
        )}
        <div className="text-xs text-slate-500 capitalize">
          {claim.claim_type?.replace("_", " ").toLowerCase()} · {claim.importance}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
