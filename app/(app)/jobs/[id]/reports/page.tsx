import { createServerClient } from "@/lib/supabaseServer";
import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BarChart2, Users, FlaskConical, Github } from "lucide-react";
import { TrustScoreRing } from "@/components/reports/TrustScoreRing";
import { Badge } from "@/components/ui/badge";
import type { Job, Candidate } from "@/lib/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReportsPage({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const db = createServerClient();

  const [{ data: job }, { data: candidates }] = await Promise.all([
    db.from("jobs").select("*").eq("id", id).single(),
    db.from("candidates")
      .select("*")
      .eq("job_id", id)
      .order("trust_score", { ascending: false, nullsFirst: false }),
  ]);

  if (!job) notFound();
  if (job.user_id !== userId) notFound();

  const typedJob = job as unknown as Job;
  const typedCandidates = (candidates ?? []) as unknown as Candidate[];

  function getScoreLabel(score: number | null) {
    if (score === null) return "Pending";
    if (score >= 70) return "High trust";
    if (score >= 40) return "Medium trust";
    return "Low trust";
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Batches
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-medium">{typedJob.label ?? "Batch"}</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        <Link href={`/jobs/${id}`} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          Swarm
        </Link>
        <Link href={`/jobs/${id}/reports`} className="px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary -mb-px flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          Candidates
        </Link>
        <Link href={`/jobs/${id}/accuracy`} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
          <BarChart2 className="w-3.5 h-3.5" />
          Accuracy
        </Link>
      </div>

      {/* Header stats */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{typedCandidates.length} candidates · ranked by trust score</h2>
        <p className="text-xs text-muted-foreground">Higher score = more verifiable claims</p>
      </div>

      {/* Candidate list */}
      {typedCandidates.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm">
          No candidates yet. Run the swarm first.
        </div>
      ) : (
        <div className="space-y-3">
          {typedCandidates.map((candidate, idx) => (
            <Link key={candidate.id} href={`/jobs/${id}/candidates/${candidate.id}`}>
              <div className="flex items-center gap-4 p-4 border border-border rounded-lg hover:border-primary/30 hover:bg-slate-900/40 transition-all cursor-pointer group">
                {/* Rank */}
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground font-mono shrink-0">
                  {idx + 1}
                </div>

                {/* Score ring */}
                <TrustScoreRing score={candidate.trust_score} size="sm" />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{candidate.name ?? "Unknown"}</span>
                    {candidate.github_handle && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Github className="w-3 h-3" />
                        {candidate.github_handle}
                      </div>
                    )}
                  </div>
                  {candidate.trust_summary && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {candidate.trust_summary}
                    </p>
                  )}
                </div>

                {/* Score label */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-lg font-bold tabular-nums text-foreground">
                    {candidate.trust_score ?? "–"}
                  </span>
                  <span className={`text-xs ${
                    (candidate.trust_score ?? 0) >= 70 ? "text-emerald-400" :
                    (candidate.trust_score ?? 0) >= 40 ? "text-amber-400" :
                    candidate.trust_score !== null ? "text-red-400" : "text-muted-foreground"
                  }`}>
                    {getScoreLabel(candidate.trust_score)}
                  </span>
                </div>

                <div className="text-muted-foreground/30 group-hover:text-muted-foreground transition-colors">›</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground/50 text-center">
        UNVERIFIABLE claims never reduce score · ClaimSwarm flags for humans, never auto-rejects
      </p>
    </div>
  );
}
