// llama-3.1-8b-instant pricing (Jun 2026)
const PRICE_INPUT_PER_M = 0.05;
const PRICE_OUTPUT_PER_M = 0.08;

export function computeCost(inputTokens: number, outputTokens: number) {
  const costUsd =
    (inputTokens / 1_000_000) * PRICE_INPUT_PER_M +
    (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M;
  return {
    costUsd,
    tokens: inputTokens + outputTokens,
  };
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${(usd * 100).toFixed(3)}¢`;
  return `$${usd.toFixed(4)}`;
}
