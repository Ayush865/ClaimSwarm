import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabaseServer";
import { chatJSON } from "@/lib/groq";
import { makeAggregatorUser, AGGREGATOR_SYSTEM } from "@/lib/prompts";
import { AggregatorOutputSchema } from "@/lib/types";
import { computeTrustScore } from "@/lib/score";

export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: jobId } = await params;
  const db = createServerClient();

  const { data: job } = await db.from("jobs").select("*").eq("id", jobId).single();
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.user_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: candidates } = await db
    .from("candidates")
    .select("*")
    .eq("job_id", jobId);

  if (!candidates?.length) {
    await db.from("jobs").update({ status: "done" }).eq("id", jobId);
    return NextResponse.json({ scored: 0 });
  }

  for (const candidate of candidates) {
    const { data: claims } = await db
      .from("claims")
      .select("*")
      .eq("candidate_id", candidate.id);

    if (!claims?.length) continue;

    const breakdown = computeTrustScore(claims);

    const verdictCounts: Record<string, number> = {};
    for (const c of claims) {
      if (c.verdict) verdictCounts[c.verdict] = (verdictCounts[c.verdict] ?? 0) + 1;
    }

    const { data: agg } = await chatJSON(
      AggregatorOutputSchema,
      AGGREGATOR_SYSTEM,
      makeAggregatorUser(candidate.name ?? "Candidate", breakdown.score, verdictCounts),
      { summary: `Trust score ${breakdown.score}/100 based on ${claims.length} verified claims.` },
      30000,
      "fast"
    );

    await db
      .from("candidates")
      .update({
        trust_score: breakdown.score,
        trust_summary: agg.summary,
        status: "scored",
      })
      .eq("id", candidate.id);
  }

  await db.from("jobs").update({ status: "done" }).eq("id", jobId);

  return NextResponse.json({ scored: candidates.length });
}
