import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabaseServer";
import type { EvalResponse, Claim } from "@/lib/types";

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

  const { data: claims } = await db
    .from("claims")
    .select("*")
    .eq("job_id", jobId)
    .not("expected_verdict", "is", null)
    .not("verdict", "is", null);

  if (!claims?.length) {
    return NextResponse.json({ error: "No evaluated claims found" }, { status: 400 });
  }

  // Treat REFUTED + SUSPICIOUS as "flagged fabrication" (positive class)
  // Treat SUPPORTED + UNVERIFIABLE as "passed" (negative class)
  function isFlagged(verdict: string | null): boolean {
    return verdict === "REFUTED" || verdict === "SUSPICIOUS";
  }

  let tp = 0, fp = 0, fn = 0, tn = 0;
  const misclassified: Claim[] = [];

  for (const claim of claims as Claim[]) {
    const predictedFlagged = isFlagged(claim.verdict);
    const actualFlagged = isFlagged(claim.expected_verdict);

    if (predictedFlagged && actualFlagged) tp++;
    else if (predictedFlagged && !actualFlagged) {
      fp++;
      misclassified.push(claim);
    } else if (!predictedFlagged && actualFlagged) {
      fn++;
      misclassified.push(claim);
    } else {
      tn++;
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const response: EvalResponse = {
    precision: Math.round(precision * 1000) / 1000,
    recall: Math.round(recall * 1000) / 1000,
    f1: Math.round(f1 * 1000) / 1000,
    matrix: { tp, fp, fn, tn },
    total: claims.length,
    misclassified,
  };

  return NextResponse.json(response);
}
