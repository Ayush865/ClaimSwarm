import { createServerClient } from "@/lib/supabaseServer";
import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Github, ExternalLink } from "lucide-react";
import { TrustScoreBreakdown } from "@/components/reports/TrustScoreBreakdown";
import { EvidenceTable } from "@/components/reports/EvidenceTable";
import { computeTrustScore } from "@/lib/score";
import type { Candidate, Claim } from "@/lib/types";

interface PageProps {
  params: Promise<{ id: string; cid: string }>;
}

export default async function CandidatePage({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id: jobId, cid } = await params;
  const db = createServerClient();

  const [{ data: job }, { data: candidate }, { data: claims }] = await Promise.all([
    db.from("jobs").select("id, user_id, label, source").eq("id", jobId).single(),
    db.from("candidates").select("*").eq("id", cid).single(),
    db.from("claims").select("*").eq("candidate_id", cid).order("importance", { ascending: false }),
  ]);

  if (!job || !candidate) notFound();
  if (job.user_id !== userId) notFound();

  const typedCandidate = candidate as unknown as Candidate;
  const typedClaims = (claims ?? []) as unknown as Claim[];

  const breakdown = computeTrustScore(typedClaims);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground transition-colors">Batches</Link>
        <span className="text-muted-foreground/40">/</span>
        <Link href={`/jobs/${jobId}/reports`} className="hover:text-foreground transition-colors">
          {(job as any).label ?? "Batch"}
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-foreground">{typedCandidate.name ?? "Candidate"}</span>
      </div>

      {/* Candidate header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{typedCandidate.name ?? "Unknown Candidate"}</h1>
          {typedCandidate.github_handle && (
            <a
              href={`https://github.com/${typedCandidate.github_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mt-1 transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              {typedCandidate.github_handle}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {typedCandidate.github_handle && (
          <div className="text-xs text-muted-foreground/50 flex items-center gap-1">
            <Github className="w-3 h-3" />
            GitHub claims auto-verified during swarm
          </div>
        )}
      </div>

      {/* Trust score breakdown */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Trust Score
        </h2>
        <TrustScoreBreakdown
          score={typedCandidate.trust_score ?? breakdown.score}
          breakdown={breakdown}
          summary={typedCandidate.trust_summary}
        />
      </section>

      {/* Claims evidence table */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Verified Claims ({typedClaims.length})
        </h2>
        <EvidenceTable claims={typedClaims} />
      </section>

      <p className="text-xs text-muted-foreground/40 text-center pb-4">
        ClaimSwarm flags for recruiters · never auto-rejects · UNVERIFIABLE ≠ false
      </p>
    </div>
  );
}
