"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Upload, Zap, Clock, CheckCircle, AlertCircle, Loader2, Plus, FlaskConical } from "lucide-react";
import type { Job } from "@/lib/types";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: any; label: string }> = {
    created: { variant: "pending", label: "Created" },
    extracting: { variant: "running", label: "Extracting" },
    verifying: { variant: "running", label: "Verifying" },
    scoring: { variant: "running", label: "Scoring" },
    done: { variant: "supported", label: "Done" },
    error: { variant: "refuted", label: "Error" },
  };
  const cfg = map[status] ?? { variant: "pending", label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
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
      }
    } catch (e) {
      setApiError(String(e));
    } finally {
      setUploadingFiles(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Verification Batches</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Each batch verifies a set of resumes with parallel agents.
          </p>
        </div>
      </div>

      {/* Error banner */}
      {apiError && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Error: </span>{apiError}
            {apiError.includes("permission") && (
              <p className="mt-1 text-red-400/70 text-xs">
                Run <code className="bg-red-500/10 px-1 rounded">supabase/fix-permissions.sql</code> in your{" "}
                <a href="https://supabase.com/dashboard/project/namokrmkkykcpcjiunpl/sql/new" target="_blank" className="underline">Supabase SQL Editor</a>.
              </p>
            )}
          </div>
        </div>
      )}

      {/* New batch actions */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="border-dashed border-border/60 hover:border-primary/40 transition-colors cursor-pointer group"
          onClick={() => fileInputRef.current?.click()}>
          <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Upload className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="font-medium text-sm">Upload Resumes</div>
              <div className="text-xs text-muted-foreground mt-0.5">PDF or DOCX · up to 10 files</div>
            </div>
            {uploadingFiles && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
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

        <Card className="border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer group"
          onClick={loadDemo}>
          <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
              {creating ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <FlaskConical className="w-5 h-5 text-primary" />}
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
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Recent batches</h2>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading...
          </div>
        ) : jobs.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Zap className="w-8 h-8 text-muted-foreground/30 mx-auto" />
            <p className="text-muted-foreground text-sm">No batches yet. Upload resumes or load the demo.</p>
          </div>
        ) : (
          jobs.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`}>
              <Card className="hover:border-primary/30 hover:bg-slate-900/50 transition-all cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      {job.source === "synthetic" ? (
                        <FlaskConical className="w-4 h-4 text-primary" />
                      ) : (
                        <Upload className="w-4 h-4 text-muted-foreground" />
                      )}
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
  );
}
