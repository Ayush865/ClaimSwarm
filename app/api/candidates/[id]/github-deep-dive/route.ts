import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@/lib/supabaseServer";
import { chatJSON } from "@/lib/groq";
import { GITHUB_AGENT_SYSTEM, makeGithubAgentUser } from "@/lib/prompts";
import { GithubAgentOutputSchema } from "@/lib/types";
import pLimit from "p-limit";

export const maxDuration = 60;

interface GithubRepo {
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string;
  topics: string[];
  owner: { login: string };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: candidateId } = await params;
  const db = createServerClient();

  const { data: candidate } = await db
    .from("candidates")
    .select("*, jobs!inner(user_id)")
    .eq("id", candidateId)
    .single();

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((candidate as any).jobs?.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!candidate.github_handle) {
    return NextResponse.json({ error: "No GitHub handle detected for this candidate" }, { status: 400 });
  }

  // Fetch public repos
  const githubResp = await fetch(
    `https://api.github.com/users/${candidate.github_handle}/repos?sort=pushed&per_page=20`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!githubResp.ok) {
    return NextResponse.json(
      { error: `GitHub API returned ${githubResp.status}` },
      { status: 400 }
    );
  }

  const repos: GithubRepo[] = await githubResp.json();

  // Get candidate's claims for context
  const { data: claims } = await db
    .from("claims")
    .select("text")
    .eq("candidate_id", candidateId);

  const claimTexts = (claims ?? []).map((c) => c.text);
  const topRepos = repos.slice(0, 8);

  const pool = pLimit(5);

  const results = await Promise.all(
    topRepos.map((repo) =>
      pool(async () => {
        const repoData = {
          name: repo.name,
          description: repo.description,
          language: repo.language,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          pushed_at: repo.pushed_at,
          topics: repo.topics ?? [],
          owner_login: repo.owner.login,
        };

        const { data } = await chatJSON(
          GithubAgentOutputSchema,
          GITHUB_AGENT_SYSTEM,
          makeGithubAgentUser(claimTexts, repoData),
          { corroborates: false, evidence: "Could not assess.", confidence: 0 }
        );

        return {
          repo: repo.name,
          corroborates: data.corroborates,
          evidence: data.evidence,
          confidence: data.confidence,
        };
      })
    )
  );

  await db
    .from("candidates")
    .update({ github_evidence: results })
    .eq("id", candidateId);

  return NextResponse.json({ evidence: results, repos_analyzed: topRepos.length });
}
