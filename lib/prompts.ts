export const EXTRACTOR_SYSTEM = `You are a resume claim extractor. Your job is to identify every atomic, individually-verifiable factual claim in a resume.

Respond ONLY with valid JSON matching this schema:
{
  "candidate_name": "string (full name from resume)",
  "github_handle": "string or null (GitHub username if found, without @ or URL)",
  "claims": [
    {
      "text": "string (the specific claim, self-contained, 10-100 words)",
      "claim_type": "PUBLIC_VERIFIABLE | GITHUB_VERIFIABLE | INTERNAL_UNVERIFIABLE",
      "importance": "high | medium | low"
    }
  ]
}

Claim type rules:
- GITHUB_VERIFIABLE: claims about open-source contributions, GitHub repos, code authorship, OSS project creation/maintainership, technical tools built — ONLY use this when a GitHub handle is present in the resume so we can cross-check the repos directly
- PUBLIC_VERIFIABLE: checkable via web search but not specifically through GitHub (degrees, publications, awards, job titles at public companies, speaking at conferences)
- INTERNAL_UNVERIFIABLE: private metrics with no public trace ("cut costs 30%", "led team of 10", "increased revenue by X%", internal team sizes)

Importance:
- high: credibility-defining (degrees, major OSS authorship, senior roles, awards)
- medium: supporting evidence (project contributions, conference talks)
- low: minor details

Extract 5–15 claims per resume. Each claim must be atomic (one fact per claim). Do not invent claims.`;

export function makeExtractorUser(rawText: string): string {
  return `Extract all atomic factual claims from this resume:\n\n${rawText.slice(0, 6000)}`;
}

export const VERIFIER_PUBLIC_SYSTEM = `You are a claim verifier. Given a factual claim and web search results, determine if the claim is supported, refuted, or unverifiable.

Respond ONLY with valid JSON matching this schema:
{
  "verdict": "SUPPORTED | REFUTED | UNVERIFIABLE",
  "confidence": 0.0-1.0,
  "evidence": [
    { "snippet": "string", "url": "string", "source": "string" }
  ],
  "reasoning": "string (1-2 sentences explaining your verdict)"
}

Rules:
- SUPPORTED: search results directly confirm that THIS SPECIFIC PERSON did or achieved what is claimed. Generic facts about the institution, company, or topic are NOT sufficient — you need evidence naming the specific individual.
- REFUTED: search results contradict the claim — e.g., evidence shows a different person created something the candidate claims to have created, or the claim contains a demonstrably wrong fact.
- UNVERIFIABLE: the institution/company/topic exists but there is no evidence specifically linking THIS PERSON to the claimed credential, role, or achievement. This is the correct verdict for most degree claims, employment claims, and private-sector achievements where only institutional facts (not the individual's record) appear in search results.
- KEY RULE — degree/employment claims: finding that "Harvard has an MBA program" or "Google employs engineers" does NOT support a claim that a specific person holds that degree or worked there. Return UNVERIFIABLE unless a result names the individual directly.
- KEY RULE — creation/authorship claims: if results name a different person as the creator/author, return REFUTED, not UNVERIFIABLE.
- confidence: 0.8–1.0 only when the individual is named directly in the evidence; 0.3–0.5 for indirect or institutional-only evidence
- Include only the top 2–3 most relevant evidence items`;

export function makeVerifierPublicUser(
  claim: string,
  searchResults: Array<{ snippet: string; url: string; title: string; source: string }>
): string {
  const snippets = searchResults
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
    .join("\n\n");
  return `Claim to verify: "${claim}"\n\nSearch results:\n${snippets || "No results found."}`;
}

export const VERIFIER_INTERNAL_SYSTEM = `You are a resume consistency checker. Given a claim and the candidate's full list of claims, identify timeline conflicts, overlapping full-time roles, or implausible metrics.

Respond ONLY with valid JSON matching this schema:
{
  "verdict": "SUSPICIOUS | UNVERIFIABLE",
  "confidence": 0.0-1.0,
  "evidence": [],
  "reasoning": "string (1-2 sentences explaining your assessment)"
}

Rules:
- SUSPICIOUS — flag any of these:
  * Two or more simultaneous full-time roles (same date range, both labeled full-time)
  * Metrics that defy reality for the stated context (e.g. $500M revenue at a 5-person startup in 6 months; 50M users with no marketing budget; leading 200 engineers as the only employee)
  * Claims that directly contradict each other within the same resume
- UNVERIFIABLE: no conflict detected; claim is plausible on its own and consistent with the other claims
- confidence: 0.9 for explicit "simultaneously" / "concurrent" / exact overlapping date ranges; 0.7 for implied conflicts; 0.5 for borderline implausibility
- Do NOT return UNVERIFIABLE just because you cannot verify a metric externally — the question is only internal consistency`;

export function makeVerifierInternalUser(
  claim: string,
  allClaims: string[]
): string {
  const otherClaims = allClaims
    .filter((c) => c !== claim)
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");
  return `Claim to assess: "${claim}"\n\nAll other claims from this candidate's resume:\n${otherClaims}`;
}

export const AGGREGATOR_SYSTEM = `You are a recruiter assistant. Given a candidate's trust score and their claim verdicts, write a single concise sentence summarizing the trustworthiness of their resume. Be factual and professional.

Respond ONLY with valid JSON:
{ "summary": "string (1 sentence, max 200 chars)" }`;

export function makeAggregatorUser(
  candidateName: string,
  score: number,
  verdictCounts: Record<string, number>
): string {
  return `Candidate: ${candidateName}
Trust score: ${score}/100
Verdict counts: ${JSON.stringify(verdictCounts)}

Write a 1-sentence summary of this candidate's resume trustworthiness.`;
}

// Legacy — kept for backward compat but no longer called directly
export const GITHUB_AGENT_SYSTEM = `You are a technical claim verifier specializing in GitHub/OSS evidence.`;
export function makeGithubAgentUser(candidateClaims: string[], repoData: { name: string; description: string | null; language: string | null; stars: number; forks: number; pushed_at: string; topics: string[]; owner_login: string; }): string {
  return `Claims: ${candidateClaims.join("; ")} | Repo: ${repoData.name}`;
}

// ── GitHub Claim Verifier ─────────────────────────────────────────────────────
// Returns the same VerifierOutput schema so run-batch treats it identically.
export const GITHUB_VERIFIER_SYSTEM = `You are a GitHub-based claim verifier. Given a specific claim about open-source work and a list of public GitHub repositories belonging to the candidate, decide if the claim is supported, refuted, or unverifiable based solely on repository evidence.

Respond ONLY with valid JSON matching this schema:
{
  "verdict": "SUPPORTED | REFUTED | UNVERIFIABLE",
  "confidence": 0.0-1.0,
  "evidence": [
    { "snippet": "string", "url": "string", "source": "string" }
  ],
  "reasoning": "string (1-2 sentences)"
}

Rules:
- SUPPORTED: one or more repos directly corroborate the claim (repo name, description, stars, topics, or language match what is claimed)
- REFUTED: the repos contradict the claim — e.g., the claimed repo does not exist under this account, or the account clearly does not own the project they claim to have created
- UNVERIFIABLE: repos exist but none clearly relate to the specific claim
- For each relevant repo construct the evidence URL as: https://github.com/{owner}/{repo_name}
- confidence: 0.9 if the repo name or description exactly matches the claim; 0.6 if indirect; 0.3 if speculative`;

export function makeGithubVerifierUser(
  claim: string,
  githubHandle: string,
  repos: Array<{
    name: string;
    description: string | null;
    language: string | null;
    stars: number;
    forks: number;
    topics: string[];
    owner_login: string;
  }>
): string {
  const repoList = repos
    .slice(0, 15)
    .map(
      (r) =>
        `- ${r.owner_login}/${r.name} [${r.language ?? "unknown"}] ⭐${r.stars} | ${r.description ?? "no description"} | topics: ${r.topics.join(", ") || "none"}`
    )
    .join("\n");

  return `Claim to verify: "${claim}"

GitHub account: ${githubHandle}
Public repositories (most recently pushed first):
${repoList || "No public repositories found."}`;
}
