import type { TrustScoreBreakdown as Breakdown } from "@/lib/types";
import { TrustScoreRing } from "./TrustScoreRing";

interface TrustScoreBreakdownProps {
  score: number;
  breakdown: Breakdown;
  summary?: string | null;
}

interface BreakdownRow {
  label: string;
  count: number;
  delta: number;
  color: string;
}

export function TrustScoreBreakdown({ score, breakdown, summary }: TrustScoreBreakdownProps) {
  const rows: BreakdownRow[] = [
    { label: "Refuted (high importance)", count: breakdown.refuted_high, delta: -25, color: "text-red-400" },
    { label: "Refuted (medium/low)", count: breakdown.refuted_medium + breakdown.refuted_low, delta: -8, color: "text-red-400/70" },
    { label: "Suspicious / inconsistent", count: breakdown.suspicious, delta: -12, color: "text-amber-400" },
    { label: "Supported (high importance)", count: breakdown.supported_high, delta: +3, color: "text-emerald-400" },
    { label: "Unverifiable (no penalty)", count: breakdown.unverifiable, delta: 0, color: "text-slate-400" },
  ].filter((r) => r.count > 0);

  return (
    <div className="flex flex-col sm:flex-row gap-6 p-5 bg-slate-900/50 border border-border rounded-lg">
      <div className="flex flex-col items-center gap-2">
        <TrustScoreRing score={score} size="lg" />
        <span className="text-xs text-muted-foreground">Trust Score</span>
      </div>
      <div className="flex-1 space-y-3">
        {summary && (
          <p className="text-sm text-muted-foreground italic">{summary}</p>
        )}
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <div className="flex items-center gap-3 tabular-nums">
                <span className="text-muted-foreground/60">×{row.count}</span>
                {row.delta !== 0 && (
                  <span className={`font-mono font-medium ${row.color}`}>
                    {row.delta > 0 ? "+" : ""}{row.delta * row.count}
                  </span>
                )}
                {row.delta === 0 && (
                  <span className="text-muted-foreground/40">no change</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border pt-2 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Final score (clamped 0–100)</span>
          <span className="font-bold text-foreground tabular-nums">{score}</span>
        </div>
        <p className="text-xs text-muted-foreground/50">
          Scoring is deterministic — no model call needed here. UNVERIFIABLE claims never reduce score.
        </p>
      </div>
    </div>
  );
}
