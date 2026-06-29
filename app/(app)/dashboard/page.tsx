"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Upload, Zap, Clock, AlertCircle, Loader2, FlaskConical,
  FileText, Brain, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/types";

// ── Upload progress overlay ────────────────────────────────────────────────────

const PHASES = [
  { id: 1, icon: Upload,       label: "Uploading Files",       sublabel: "Transferring to server…" },
  { id: 2, icon: FileText,     label: "Parsing PDFs",          sublabel: "Extracting resume text…" },
  { id: 3, icon: Brain,        label: "Extracting Claims",     sublabel: "AI is reading the resume…" },
  { id: 4, icon: CheckCircle2, label: "Finalising",            sublabel: "Building claim list…" },
];

function UploadProgressOverlay({ fileCount }: { fileCount: number }) {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const id = setInterval(() =>
      setPhaseIdx((i) => Math.min(i + 1, PHASES.length - 1)), 6000);
    return () => clearInterval(id);
  }, []);

  const phase = PHASES[phaseIdx];
  const PhaseIcon = phase.icon;

  return (
    <Dialog open modal>
      {/* custom overlay + content — bypasses shadcn's default overlay colours */}
      <DialogContent
        className="border-0 bg-transparent p-0 shadow-none max-w-none w-full h-full sm:max-w-none [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        aria-describedby="upload-progress-desc"
      >
        {/* full-screen backdrop */}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md px-4">

          {/* Glassmorphism card — from 21st dev + UI Pro Max guidance */}
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900/90 backdrop-blur-xl shadow-2xl shadow-black/60">

            {/* Subtle emerald glow gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/8 via-transparent to-slate-900/60 pointer-events-none" />

            {/* Top accent line */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent" />

            <div className="relative p-8 md:p-10 space-y-8">

              {/* Phase icon with pulsing rings */}
              <div className="flex justify-center">
                <div className="relative flex items-center justify-center">
                  {/* Outer ping ring — only when motion ok */}
                  {!reducedMotion && (
                    <span className="absolute w-28 h-28 rounded-full bg-emerald-500/15 animate-ping"
                          style={{ animationDuration: "2s" }} />
                  )}
                  {/* Mid pulse ring */}
                  {!reducedMotion && (
                    <span className="absolute w-24 h-24 rounded-full bg-emerald-500/10 animate-pulse"
                          style={{ animationDuration: "1.5s" }} />
                  )}
                  {/* Icon circle */}
                  <div className="relative z-10 flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/40">
                    <PhaseIcon className="w-9 h-9 text-white" strokeWidth={2} />
                  </div>
                </div>
              </div>

              {/* Phase label */}
              <div className="text-center space-y-1">
                <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight transition-all duration-500">
                  {phase.label}
                </h2>
                <p id="upload-progress-desc" className="text-sm text-slate-400 transition-all duration-500">
                  {phase.sublabel}
                </p>
                <p className="text-xs text-slate-500 pt-1">
                  {fileCount} resume{fileCount !== 1 ? "s" : ""} · this may take 20–60 s
                </p>
              </div>

              {/* Indeterminate shimmer bar */}
              <div className="relative h-1.5 rounded-full bg-slate-800 overflow-hidden">
                {reducedMotion ? (
                  <div className="absolute inset-0 w-1/2 rounded-full bg-emerald-500/60" />
                ) : (
                  <div className="absolute inset-y-0 w-2/5 rounded-full bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-shimmer" />
                )}
              </div>

              {/* Step pills — from 21st dev design */}
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-center">
                {PHASES.map((p, i) => {
                  const PillIcon = p.icon;
                  const isActive    = i === phaseIdx;
                  const isCompleted = i  < phaseIdx;
                  const isPending   = i  > phaseIdx;
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-medium transition-all duration-300",
                        isActive    && "bg-emerald-500/20 border-emerald-500/70 shadow-md shadow-emerald-500/20 text-emerald-300",
                        isCompleted && "bg-emerald-500/10 border-emerald-600/40 text-emerald-400",
                        isPending   && "bg-slate-800/50 border-slate-700/50 text-slate-500",
                      )}
                    >
                      <PillIcon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{p.label}</span>
                      {isCompleted && <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-500" />}
                    </div>
                  );
                })}
              </div>

              {/* Step bar (thin lines) */}
              <div className="flex gap-1.5">
                {PHASES.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-0.5 flex-1 rounded-full transition-colors duration-500",
                      i <= phaseIdx ? "bg-emerald-500" : "bg-slate-700",
                    )}
                  />
                ))}
              </div>

            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: any; label: string }> = {
    created:    { variant: "pending",   label: "Created" },
    extracting: { variant: "running",   label: "Extracting" },
    verifying:  { variant: "running",   label: "Verifying" },
    scoring:    { variant: "running",   label: "Scoring" },
    done:       { variant: "supported", label: "Done" },
    error:      { variant: "refuted",   label: "Error" },
  };
  const cfg = map[status] ?? { variant: "pending", label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [jobs, setJobs]                     = useState<Job[]>([]);
  const [loading, setLoading]               = useState(true);
  const [creating, setCreating]             = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadFileCount, setUploadFileCount] = useState(0);
  const [apiError, setApiError]             = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadJobs() {
    try {
      const resp = await fetch("/api/jobs");
      if (resp.ok) {
        const data = await resp.json();
        setJobs(data.jobs ?? []);
      } else {
        const err = await resp.json().catch(() => ({}));
        setApiError(err.error ?? `Failed to load jobs (${resp.status})`);
      }
    } catch (e) {
      setApiError(String(e));
    }
    setLoading(false);
  }

  useEffect(() => { loadJobs(); }, []);

  async function loadDemo() {
    setCreating(true);
    setApiError(null);
    try {
      const resp = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ synthetic: true }),
      });
      const data = await resp.json();
      if (resp.ok) {
        window.location.href = `/jobs/${data.jobId}`;
      } else {
        setApiError(data.error ?? `Server error ${resp.status}`);
      }
    } catch (e) {
      setApiError(String(e));
    } finally {
      setCreating(false);
    }
  }

  async function uploadFiles(files: FileList) {
    if (!files.length) return;
    setUploadFileCount(files.length);
    setUploadingFiles(true);
    setApiError(null);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      const resp = await fetch("/api/jobs", { method: "POST", body: form });
      const data = await resp.json();
      if (resp.ok) {
        window.location.href = `/jobs/${data.jobId}`;
      } else {
        setApiError(data.error ?? `Server error ${resp.status}`);
        setUploadingFiles(false);
      }
    } catch (e) {
      setApiError(String(e));
      setUploadingFiles(false);
    }
  }

  return (
    <>
      {uploadingFiles && <UploadProgressOverlay fileCount={uploadFileCount} />}

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Verification Batches</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Each batch verifies a set of resumes with parallel agents.
          </p>
        </div>

        {/* Error banner */}
        {apiError && (
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium">Error: </span>{apiError}
              {apiError.includes("permission") && (
                <p className="mt-1 text-red-400/70 text-xs">
                  Run{" "}
                  <code className="bg-red-500/10 px-1 rounded">supabase/fix-permissions.sql</code>{" "}
                  in your{" "}
                  <a
                    href="https://supabase.com/dashboard/project/namokrmkkykcpcjiunpl/sql/new"
                    target="_blank"
                    className="underline"
                  >
                    Supabase SQL Editor
                  </a>.
                </p>
              )}
            </div>
          </div>
        )}

        {/* New batch actions */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Card
            className="border-dashed border-border/60 hover:border-primary/40 transition-colors cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
          >
            <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Upload className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="font-medium text-sm">Upload Resumes</div>
                <div className="text-xs text-muted-foreground mt-0.5">PDF or DOCX · up to 10 files</div>
              </div>
            </CardContent>
          </Card>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc"
            className="hidden"
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          />

          <Card
            className="border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer group"
            onClick={loadDemo}
          >
            <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                {creating
                  ? <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  : <FlaskConical className="w-5 h-5 text-primary" />}
              </div>
              <div>
                <div className="font-medium text-sm text-primary">Load Demo Batch</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  8 synthetic resumes · ground-truth labels · accuracy view
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Jobs list */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Recent batches
          </h2>

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          ) : jobs.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <Zap className="w-8 h-8 text-muted-foreground/30 mx-auto" />
              <p className="text-muted-foreground text-sm">
                No batches yet. Upload resumes or load the demo.
              </p>
            </div>
          ) : (
            jobs.map((job) => (
              <Link key={job.id} href={`/jobs/${job.id}`}>
                <Card className="hover:border-primary/30 hover:bg-slate-900/50 transition-all cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        {job.source === "synthetic"
                          ? <FlaskConical className="w-4 h-4 text-primary" />
                          : <Upload className="w-4 h-4 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{job.label ?? "Batch"}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          {formatDate(job.created_at)}
                          <span>·</span>
                          {job.total_candidates} resumes
                          <span>·</span>
                          {job.claims_done}/{job.total_claims} claims
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {Number(job.cost_usd) > 0 && (
                        <span className="text-xs text-muted-foreground font-mono">
                          ${Number(job.cost_usd).toFixed(4)}
                        </span>
                      )}
                      <StatusBadge status={job.status} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}
