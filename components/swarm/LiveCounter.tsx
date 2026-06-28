"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface LiveCounterProps {
  claimsDone: number;
  totalClaims: number;
  costUsd: number;
  isRunning: boolean;
  startedAt: number | null;
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.001) return `<$0.001`;
  return `$${usd.toFixed(3)}`;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${rem.toString().padStart(2, "0")}s`;
}

interface MetricProps {
  label: string;
  value: string;
  accent?: boolean;
  pulse?: boolean;
}

function Metric({ label, value, accent, pulse }: MetricProps) {
  return (
    <div className="flex items-center gap-2">
      {pulse && (
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      )}
      <div>
        <span className={cn("font-mono text-sm font-semibold tabular-nums", accent ? "text-emerald-400" : "text-foreground")}>
          {value}
        </span>
        <span className="text-xs text-muted-foreground ml-1.5">{label}</span>
      </div>
    </div>
  );
}

export function LiveCounter({ claimsDone, totalClaims, costUsd, isRunning, startedAt }: LiveCounterProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt || !isRunning) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - startedAt);
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt, isRunning]);

  const pct = totalClaims > 0 ? Math.round((claimsDone / totalClaims) * 100) : 0;

  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 bg-slate-900/80 border border-slate-800 rounded-lg backdrop-blur-sm">
      <Metric
        label="agents dispatched"
        value={claimsDone.toString()}
        accent
        pulse={isRunning}
      />
      <div className="w-px h-4 bg-slate-700" />
      <Metric
        label={`/ ${totalClaims} claims`}
        value={`${claimsDone}`}
      />
      <div className="hidden sm:flex items-center gap-1 flex-1 min-w-24">
        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground font-mono w-8 text-right">{pct}%</span>
      </div>
      <div className="w-px h-4 bg-slate-700" />
      <Metric label="cost" value={formatCost(costUsd)} />
      <div className="w-px h-4 bg-slate-700" />
      <Metric
        label="elapsed"
        value={startedAt ? formatElapsed(elapsed) : "—"}
      />
      {isRunning && (
        <div className="ml-auto flex items-center gap-1.5 text-xs text-blue-400">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          Swarm running
        </div>
      )}
    </div>
  );
}
