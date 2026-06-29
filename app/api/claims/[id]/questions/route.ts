import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabaseServer";
import { chatJSON } from "@/lib/groq";
import { QUESTION_GENERATOR_SYSTEM, makeQuestionGeneratorUser } from "@/lib/prompts";
import { z } from "zod";

const QuestionsSchema = z.object({
  questions: z.array(z.string()).min(1).max(5),
});

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: claimId } = await params;
  const db = createServerClient();

  const { data: claim } = await db
    .from("claims")
    .select("text, verdict, reasoning, job_id")
    .eq("id", claimId)
    .single();

  if (!claim) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (claim.verdict !== "SUSPICIOUS" && claim.verdict !== "REFUTED") {
    return NextResponse.json({ error: "Questions only available for SUSPICIOUS or REFUTED claims" }, { status: 400 });
  }

  // Verify ownership via the parent job
  const { data: job } = await db
    .from("jobs")
    .select("user_id")
    .eq("id", claim.job_id)
    .single();

  if (!job || job.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data } = await chatJSON(
    QuestionsSchema,
    QUESTION_GENERATOR_SYSTEM,
    makeQuestionGeneratorUser(claim.text, claim.verdict, claim.reasoning ?? ""),
    { questions: ["Can you walk me through this experience in more detail?"] },
    20000,
    "fast"
  );

  return NextResponse.json({ questions: data.questions });
}
