import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabaseServer";
import { chatJSON } from "@/lib/groq";
import {
  EXTRACTOR_SYSTEM,
  makeExtractorUser,
} from "@/lib/prompts";
import { ExtractorOutputSchema } from "@/lib/types";
import path from "path";
import fs from "fs";

export const maxDuration = 60;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServerClient();
  const { data: jobs, error } = await db
    .from("jobs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServerClient();

  const contentType = req.headers.get("content-type") ?? "";
  const isSynthetic = contentType.includes("application/json");

  // Create the job row
  const { data: job, error: jobErr } = await db
    .from("jobs")
    .insert({
      user_id: userId,
      label: isSynthetic ? "Synthetic Test Set" : "Uploaded Batch",
      source: isSynthetic ? "synthetic" : "upload",
      status: "extracting",
    })
    .select()
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: jobErr?.message ?? "Failed to create job" }, { status: 500 });
  }

  if (isSynthetic) {
    return handleSynthetic(job.id, userId, db);
  }

  return handleUpload(req, job.id, userId, db);
}

async function handleSynthetic(jobId: string, _userId: string, db: ReturnType<typeof createServerClient>) {
  const syntheticPath = path.join(process.cwd(), "scripts", "synthetic-data.json");

  if (!fs.existsSync(syntheticPath)) {
    await db.from("jobs").update({ status: "error" }).eq("id", jobId);
    return NextResponse.json(
      { error: "Synthetic data not found. Run: npm run generate-synthetic" },
      { status: 400 }
    );
  }

  const syntheticData = JSON.parse(fs.readFileSync(syntheticPath, "utf-8")) as SyntheticCandidate[];
  let totalClaims = 0;

  for (const candidate of syntheticData) {
    const { data: cand } = await db
      .from("candidates")
      .insert({
        job_id: jobId,
        name: candidate.name,
        github_handle: candidate.github_handle ?? null,
        raw_text: candidate.rawText,
        status: "extracted",
      })
      .select()
      .single();

    if (!cand) continue;

    const claimRows = candidate.claims.map((c) => ({
      candidate_id: cand.id,
      job_id: jobId,
      text: c.text,
      claim_type: c.claim_type,
      importance: c.importance,
      expected_verdict: c.expected_verdict,
      status: "pending",
    }));

    await db.from("claims").insert(claimRows);
    totalClaims += claimRows.length;
  }

  await db
    .from("jobs")
    .update({
      status: "verifying",
      total_candidates: syntheticData.length,
      total_claims: totalClaims,
    })
    .eq("id", jobId);

  return NextResponse.json({ jobId, candidates: syntheticData.length, claims: totalClaims });
}

async function handleUpload(
  req: NextRequest,
  jobId: string,
  _userId: string,
  db: ReturnType<typeof createServerClient>
) {
  const formData = await req.formData();
  const files = formData.getAll("files") as File[];

  if (!files.length) {
    await db.from("jobs").update({ status: "error" }).eq("id", jobId);
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  let totalClaims = 0;
  const processed = [];

  for (const file of files.slice(0, 10)) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "docx", "doc"].includes(ext)) continue;

    const buf = Buffer.from(await file.arrayBuffer());
    let rawText = "";

    try {
      if (ext === "pdf") {
        const pdfParse = (await import("pdf-parse")).default;
        const pdfData = await pdfParse(buf);
        rawText = pdfData.text;
      } else {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer: buf });
        rawText = result.value;
      }
    } catch (err) {
      console.error(`Failed to extract text from ${file.name}:`, err);
      continue;
    }

    if (rawText.length < 50) continue;

    // Create candidate
    const { data: cand } = await db
      .from("candidates")
      .insert({
        job_id: jobId,
        raw_text: rawText.slice(0, 20000),
        status: "pending",
      })
      .select()
      .single();

    if (!cand) continue;

    // Upload to Supabase Storage
    const storagePath = `resumes/${jobId}/${cand.id}.${ext}`;
    await db.storage.from("resumes").upload(storagePath, buf, {
      contentType: ext === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    // Run extractor agent
    const fallback = { claims: [], candidate_name: undefined, github_handle: null };
    const result = await chatJSON(
      ExtractorOutputSchema,
      EXTRACTOR_SYSTEM,
      makeExtractorUser(rawText),
      fallback
    );

    const { data: extracted } = result;

    // Update candidate with name + github handle
    await db
      .from("candidates")
      .update({
        name: extracted.candidate_name ?? file.name.replace(/\.[^.]+$/, ""),
        github_handle: extracted.github_handle ?? null,
        storage_path: storagePath,
        status: "extracted",
      })
      .eq("id", cand.id);

    // Insert claims
    if (extracted.claims.length > 0) {
      const claimRows = extracted.claims.map((c) => ({
        candidate_id: cand.id,
        job_id: jobId,
        text: c.text,
        claim_type: c.claim_type,
        importance: c.importance,
        status: "pending",
      }));
      await db.from("claims").insert(claimRows);
      totalClaims += claimRows.length;
    }

    processed.push(cand.id);
  }

  await db
    .from("jobs")
    .update({
      status: "verifying",
      total_candidates: processed.length,
      total_claims: totalClaims,
    })
    .eq("id", jobId);

  return NextResponse.json({ jobId, candidates: processed.length, claims: totalClaims });
}

interface SyntheticClaim {
  text: string;
  claim_type: "PUBLIC_VERIFIABLE" | "INTERNAL_UNVERIFIABLE";
  importance: "high" | "medium" | "low";
  expected_verdict: "SUPPORTED" | "REFUTED" | "UNVERIFIABLE" | "SUSPICIOUS";
}

interface SyntheticCandidate {
  name: string;
  github_handle?: string;
  rawText: string;
  claims: SyntheticClaim[];
}
