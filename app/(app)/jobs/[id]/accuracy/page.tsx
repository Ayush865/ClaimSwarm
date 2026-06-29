"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { BarChart2, Users, Loader2, Upload, Download } from "lucide-react";
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
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ matched: number; unmatched: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function runEval() {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/jobs/${id}/eval`, { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) setError(data.error ?? "Eval failed");
      else setEvalData(data);
    } finally {
      setLoading(false);
    }
  }

  async function downloadTemplate() {
    const resp = await fetch(`/api/jobs/${id}/ground-truth`);
    if (!resp.ok) return;
    const data = await resp.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ground-truth-template-${id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importGroundTruth(file: File) {
    setImporting(true);
    setError(null);
    setImportResult(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      // Accept both array and {claims: [...]} shapes
      const payload = Array.isArray(json) ? json : json.claims ?? [];
      // Normalise keys: support both {claim_text, expected_verdict} and {text, expected_verdict}
      const normalised = payload.map((item: Record<string, string>) => ({
        claim_text: item.claim_text ?? item.text ?? "",
        expected_verdict: item.expected_verdict ?? item.expected ?? "",
      }));

      const resp = await fetch(`/api/jobs/${id}/ground-truth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalised),
      });
      const data = await resp.json();
      if (!resp.ok) setError(data.error ?? "Import failed");
      else setImportResult(data);
    } catch {
      setError("Invalid JSON file");
    } finally {
      setImporting(false);
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
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">Accuracy Analysis</h1>
          <p className="text-sm text-muted-foreground">
            Compare each claim&apos;s verdict against ground-truth labels. Import a JSON file to set labels on any batch.
          </p>
        </div>

        {/* Ground truth controls */}
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Download Template
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="gap-1.5"
          >
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Import Ground Truth
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importGroundTruth(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-950/40 border border-emerald-800/50 rounded-lg text-sm">
          <span className="text-emerald-400 font-medium">{importResult.matched} claims matched</span>
          {importResult.unmatched > 0 && (
            <span className="text-muted-foreground">· {importResult.unmatched} unmatched</span>
          )}
          <span className="text-muted-foreground ml-auto">Ground truth set — run eval below</span>
        </div>
      )}

      {error && (
        <div className="px-4 py-2.5 bg-red-950/40 border border-red-800/50 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Eval trigger */}
      {!evalData && (
        <div className="flex flex-col items-center gap-4 py-10 border border-dashed border-border rounded-lg">
          <BarChart2 className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Run precision/recall analysis against ground-truth labels</p>
          <Button onClick={runEval} disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Computing...</> : "Compute Accuracy"}
          </Button>
        </div>
      )}

      {evalData && (
        <div className="space-y-8">
          <section>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Metrics</h2>
            <MetricsBar
              precision={evalData.precision}
              recall={evalData.recall}
              f1={evalData.f1}
              total={evalData.total}
            />
          </section>

          <section>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Confusion Matrix</h2>
            <ConfusionMatrix
              tp={evalData.matrix.tp}
              fp={evalData.matrix.fp}
              fn={evalData.matrix.fn}
              tn={evalData.matrix.tn}
            />
          </section>

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
