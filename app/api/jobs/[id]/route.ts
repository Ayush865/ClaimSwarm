import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabaseServer";

export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = createServerClient();

  const [{ data: job }, { data: candidates }] = await Promise.all([
    db.from("jobs").select("*").eq("id", id).single(),
    db.from("candidates").select("*").eq("job_id", id).order("trust_score", { ascending: false }),
  ]);

  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.user_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ job, candidates });
}
