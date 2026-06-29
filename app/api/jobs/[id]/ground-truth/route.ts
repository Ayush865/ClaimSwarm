import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabaseServer";
import { z } from "zod";

export const maxDuration = 30;

const GroundTruthItemSchema = z.object({
  claim_text: z.string().min(1),
  expected_verdict: z.enum(["SUPPORTED", "REFUTED", "UNVERIFIABLE", "SUSPICIOUS"]),
});

const GroundTruthPayloadSchema = z.array(GroundTruthItemSchema);

// Normalize text for fuzzy matching — lowercase, collapse whitespace, strip punctuation
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  // Count overlapping words
  const wa = new Set(na.split(" "));
  const wb = new Set(nb.split(" "));
  const intersection = [...wa].filter((w) => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return intersection / union;
}

// POST — import ground truth labels
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: jobId } = await params;
  const db = createServerClient();

  const { data: job } = await db.from("jobs").select("id, user_id").eq("id", jobId).single();
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.user_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = GroundTruthPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { data: claims } = await db
    .from("claims")
    .select("id, text")
    .eq("job_id", jobId);

  if (!claims?.length) return NextResponse.json({ error: "No claims found" }, { status: 404 });

  let matched = 0;
  let unmatched = 0;

  for (const item of parsed.data) {
    // Find the best-matching claim by similarity score
    let bestId: string | null = null;
    let bestScore = 0;

    for (const claim of claims) {
      const score = similarity(item.claim_text, claim.text);
      if (score > bestScore) {
        bestScore = score;
        bestId = claim.id;
      }
    }

    // Require at least 50% word overlap to count as a match
    if (bestId && bestScore >= 0.5) {
      await db
        .from("claims")
        .update({ expected_verdict: item.expected_verdict })
        .eq("id", bestId);
      matched++;
    } else {
      unmatched++;
    }
  }

  return NextResponse.json({ matched, unmatched, total: parsed.data.length });
}

// GET — download a template JSON for this job's claims
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: jobId } = await params;
  const db = createServerClient();

  const { data: job } = await db.from("jobs").select("id, user_id").eq("id", jobId).single();
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.user_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: claims } = await db
    .from("claims")
    .select("text, claim_type, importance, expected_verdict, candidate_id")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  const { data: candidates } = await db
    .from("candidates")
    .select("id, name")
    .eq("job_id", jobId);

  const nameById = new Map((candidates ?? []).map((c) => [c.id, c.name]));

  const template = (claims ?? []).map((c) => ({
    candidate_name: nameById.get(c.candidate_id) ?? "Unknown",
    claim_text: c.text,
    claim_type: c.claim_type,
    importance: c.importance,
    expected_verdict: c.expected_verdict ?? null,
  }));

  return NextResponse.json(template);
}
