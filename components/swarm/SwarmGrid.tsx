"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { SwarmCell } from "./SwarmCell";
import { LiveCounter } from "./LiveCounter";
import { Button } from "@/components/ui/button";
import type { Claim, Job } from "@/lib/types";
import { TooltipProvider } from "@/components/ui/tooltip";

interface SwarmGridProps {
  jobId: string;
  initialClaims: Claim[];
  initialJob: Job;
}

export function SwarmGrid({ jobId, initialClaims, initialJob }: SwarmGridProps) {
  const router = useRouter();
  const [claims, setClaims] = useState<Map<string, Claim>>(
    new Map(initialClaims.map((c) => [c.id, c]))
  );
  const [job, setJob] = useState<Job>(initialJob);
  const [isRunning, setIsRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [accumulatedCost, setAccumulatedCost] = useState(0);
  const driverRef = useRef<AbortController | null>(null);

  // Subscribe to Realtime for this job
  useEffect(() => {
    const claimsChannel = supabase
      .channel(`swarm-claims-${jobId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "claims", filter: `job_id=eq.${jobId}` },
        (payload) => {
          const updated = payload.new as Claim;
          setClaims((prev) => new Map(prev).set(updated.id, updated));
        }
      )
      .subscribe();

    const jobsChannel = supabase
      .channel(`swarm-job-${jobId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` },
        (payload) => {
          setJob(payload.new as Job);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(claimsChannel);
      supabase.removeChannel(jobsChannel);
    };
  }, [jobId]);

  const runSwarm = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setStartedAt(Date.now());
    setAccumulatedCost(0);

    const ctrl = new AbortController();
    driverRef.current = ctrl;

    try {
      let remaining = Infinity;

      while (remaining > 0 && !ctrl.signal.aborted) {
        const resp = await fetch(`/api/jobs/${jobId}/run-batch`, {
          method: "POST",
          signal: ctrl.signal,
        });

        if (!resp.ok) break;
        const data = await resp.json();
        remaining = data.remaining ?? 0;
        if (data.costUsd) setAccumulatedCost((prev) => prev + data.costUsd);

        if (remaining === 0) break;
      }

      // Score candidates
      await fetch(`/api/jobs/${jobId}/score`, { method: "POST" });
      // Refresh server data (updates job status, candidate scores in page)
      router.refresh();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Swarm driver error:", err);
      }
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, jobId, router]);

  const stopSwarm = () => {
    driverRef.current?.abort();
    setIsRunning(false);
  };

  const claimList = Array.from(claims.values());
  const pendingCount = claimList.filter((c) => c.status === "pending").length;
  const runningCount = claimList.filter((c) => c.status === "running").length;
  const doneCount = claimList.filter((c) => c.status === "done" || c.status === "error").length;

  // Verdict legend
  const legend = [
    { label: "Supported", color: "bg-emerald-500" },
    { label: "Refuted", color: "bg-red-500" },
    { label: "Suspicious", color: "bg-amber-500" },
    { label: "Unverifiable", color: "bg-slate-500" },
    { label: "Running", color: "bg-blue-500" },
    { label: "Pending", color: "bg-slate-700" },
  ];

  const canRun = !isRunning && (job.status === "verifying" || pendingCount > 0);
  const isDone = job.status === "done";

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {/* Counter bar */}
        <LiveCounter
          claimsDone={doneCount}
          activeAgents={runningCount}
          totalClaims={job.total_claims}
          costUsd={isRunning ? accumulatedCost : Number(job.cost_usd)}
          isRunning={isRunning}
          startedAt={startedAt}
        />

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-3">
            {legend.map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
                {label}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {isRunning ? (
              <Button variant="outline" size="sm" onClick={stopSwarm}>
                Stop
              </Button>
            ) : isDone ? (
              <span className="text-sm text-emerald-400 font-medium">Swarm complete</span>
            ) : (
              <Button
                size="sm"
                onClick={runSwarm}
                disabled={!canRun}
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                Run Swarm
              </Button>
            )}
          </div>
        </div>

        {/* Grid */}
        {claimList.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            No claims extracted yet.
          </div>
        ) : (
          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(24px, 1fr))" }}>
            {claimList.map((claim) => (
              <SwarmCell key={claim.id} claim={claim} />
            ))}
          </div>
        )}

        {/* Status summary */}
        {claimList.length > 0 && (
          <div className="flex gap-4 text-xs text-muted-foreground border-t border-border pt-3">
            <span>{doneCount} verified</span>
            <span>{pendingCount} pending</span>
            <span>{claimList.filter(c => c.status === "running").length} running</span>
            <span>{claimList.filter(c => c.status === "error").length} errors</span>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
