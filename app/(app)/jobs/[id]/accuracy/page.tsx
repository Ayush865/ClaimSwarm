"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BarChart2, Users, Loader2 } from "lucide-react";
import { ConfusionMatrix } from "@/components/accuracy/ConfusionMatrix";
import { MetricsBar } from "@/components/accuracy/MetricsBar";
import { EvidenceTable } from "@/components/reports/EvidenceTable";
import { Button } from "@/components/ui/button";
import type { EvalResponse, Claim } from "@/lib/types";

export default function AccuracyPage() {
  const params = useParams();
  const id = params.id as string;

  const [evalData, setEvalData] = useState<EvalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runEval() {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/jobs/${id}/eval`, { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? "Eval failed");
      } else {
        setEvalData(data);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        <Link href={`/jobs/${id}`} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          Swarm
        </Link>
        <Link href={`/jobs/${id}/reports`} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          Candidates
        </Link>
        <Link href={`/jobs/${id}/accuracy`} className="px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary -mb-px flex items-center gap-1.5">
          <BarChart2 className="w-3.5 h-3.5" />
          Accuracy
        </Link>
      </div>

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-xl font-bold">Accuracy Analysis</h1>
        <p className="text-sm text-muted-foreground">
          Compare each claim&apos;s verdict against ground-truth labels planted in the synthetic set.
          This is how we know the swarm works — not because it sounds good, but because we measured it.
        </p>
      </div>

      {/* Eval trigger */}
      {!evalData && (
        <div className="flex flex-col items-center gap-4 py-10 border border-dashed border-border rounded-lg">
          <BarChart2 className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Run precision/recall analysis against ground-truth labels</p>
          <Button onClick={runEval} disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Computing...</> : "Compute Accuracy"}
          </Button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      )}

      {evalData && (
        <div className="space-y-8">
          {/* Metrics */}
          <section>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
              Metrics
            </h2>
            <MetricsBar
              precision={evalData.precision}
              recall={evalData.recall}
              f1={evalData.f1}
              total={evalData.total}
            />
          </section>

          {/* Confusion matrix */}
          <section>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
              Confusion Matrix
            </h2>
            <ConfusionMatrix
              tp={evalData.matrix.tp}
              fp={evalData.matrix.fp}
              fn={evalData.matrix.fn}
              tn={evalData.matrix.tn}
            />
          </section>

          {/* Misclassified */}
          {evalData.misclassified.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Misclassified Claims ({evalData.misclassified.length})
                </h2>
                <p className="text-xs text-muted-foreground">These would NOT be auto-rejected — only flagged for review</p>
              </div>
              <EvidenceTable claims={evalData.misclassified as Claim[]} />
            </section>
          )}

          {/* Re-run button */}
          <Button variant="outline" size="sm" onClick={runEval} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Re-evaluate"}
          </Button>

          <p className="text-xs text-muted-foreground/40 pb-4">
            &ldquo;Here&apos;s how I know it&apos;s right: I planted known fabrications and measured precision and recall —
            here&apos;s the confusion matrix, including the cases it misses, which I would not auto-reject on.&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}
