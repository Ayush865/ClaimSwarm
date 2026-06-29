// Fixed pricing: llama-3.1-8b-instant rates applied to all models.
// $0.05 / 1M input tokens · $0.08 / 1M output tokens (Groq Jun 2026)
const PRICE_INPUT  = 0.05;
const PRICE_OUTPUT = 0.08;

export function computeCost(inputTokens: number, outputTokens: number, _model = "") {
  const costUsd =
    (inputTokens  / 1_000_000) * PRICE_INPUT +
    (outputTokens / 1_000_000) * PRICE_OUTPUT;
  return {
    costUsd,
    tokens: inputTokens + outputTokens,
  };
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${(usd * 100).toFixed(3)}¢`;
  return `$${usd.toFixed(4)}`;
}
