import { createServerClient } from "@/lib/supabaseServer";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { SwarmGrid } from "@/components/swarm/SwarmGrid";
import Link from "next/link";
import { ArrowLeft, BarChart2, Users, FlaskConical } from "lucide-react";
import type { Job, Claim, Candidate } from "@/lib/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function JobPage({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const db = createServerClient();

  const [{ data: job }, { data: claims }, { data: candidates }] = await Promise.all([
    db.from("jobs").select("*").eq("id", id).single(),
    db.from("claims").select("*").eq("job_id", id).order("created_at", { ascending: true }),
    db.from("candidates").select("id, name, github_handle").eq("job_id", id).order("created_at", { ascending: true }),
  ]);

  if (!job) notFound();
  if (job.user_id !== userId) notFound();

  const typedJob = job as unknown as Job;
  const typedClaims = (claims ?? []) as unknown as Claim[];
  const typedCandidates = (candidates ?? []) as unknown as Pick<Candidate, "id" | "name" | "github_handle">[];

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Batches
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-medium">{typedJob.label ?? "Batch"}</span>
        {typedJob.source === "synthetic" && (
          <div className="flex items-center gap-1 text-xs text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
            <FlaskConical className="w-3 h-3" />
            Synthetic
          </div>
        )}
      </div>

      {/* Nav tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        <Link
          href={`/jobs/${id}`}
          className="px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary -mb-px"
        >
          Swarm
        </Link>
        <Link
          href={`/jobs/${id}/reports`}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          <Users className="w-3.5 h-3.5" />
          Candidates
        </Link>
        <Link
          href={`/jobs/${id}/accuracy`}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          <BarChart2 className="w-3.5 h-3.5" />
          Accuracy
        </Link>
      </div>

      {/* Swarm grid */}
      <SwarmGrid
        jobId={id}
        initialClaims={typedClaims}
        initialJob={typedJob}
        candidates={typedCandidates}
      />

      {/* Token + cost badge */}
      <div className="fixed bottom-4 right-4 flex items-center gap-1.5 bg-slate-900/90 border border-slate-700 rounded-full px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
        {Number(typedJob.tokens_used) > 0 ? (
          <>
            <span className="font-mono">{Number(typedJob.tokens_used).toLocaleString()}</span>
            <span className="text-slate-500">tok</span>
          </>
        ) : (
          <span>no runs yet</span>
        )}
        {Number(typedJob.cost_usd) > 0 && (
          <>
            <span className="text-slate-600">·</span>
            <span className="font-mono">${Number(typedJob.cost_usd).toFixed(4)}</span>
          </>
        )}
      </div>
    </div>
  );
}
