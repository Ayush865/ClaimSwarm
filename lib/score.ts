import type { Claim, TrustScoreBreakdown } from "./types";

export function computeTrustScore(claims: Claim[]): TrustScoreBreakdown {
  // Base 75 = "neutral / unverified". SUPPORTED claims earn the score upward;
  // REFUTED/SUSPICIOUS drag it down. All-UNVERIFIABLE lands at 75, not 100.
  let score = 75;
  let refuted_high = 0;
  let refuted_medium = 0;
  let refuted_low = 0;
  let suspicious = 0;
  let supported_high = 0;
  let supported_medium = 0;
  let unverifiable = 0;

  for (const claim of claims) {
    if (!claim.verdict) continue;
    if (claim.verdict === "REFUTED") {
      if (claim.importance === "high") refuted_high++;
      else if (claim.importance === "medium") refuted_medium++;
      else refuted_low++;
    } else if (claim.verdict === "SUSPICIOUS") {
      suspicious++;
    } else if (claim.verdict === "SUPPORTED") {
      if (claim.importance === "high") supported_high++;
      else if (claim.importance === "medium") supported_medium++;
    } else if (claim.verdict === "UNVERIFIABLE") {
      unverifiable++;
    }
  }

  score -= refuted_high * 25;
  score -= refuted_medium * 8;
  score -= refuted_low * 8;
  score -= suspicious * 12;
  // Up to +25 bonus: high-importance verified claims are worth more
  score += Math.min(supported_high * 6 + supported_medium * 2, 25);

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    refuted_high,
    refuted_medium,
    refuted_low,
    suspicious,
    supported_high,
    unverifiable,
  };
}
