// Approximate pricing per 1M tokens (Jun 2026).
// Keys are provider model IDs — substring-match is used so "70b" catches any 70B variant.
const PRICING_TABLE: Array<{ match: string; input: number; output: number }> = [
  // DeepSeek
  { match: "deepseek-reasoner", input: 0.55,  output: 2.19 },
  { match: "deepseek-chat",     input: 0.07,  output: 0.28 },
  // Llama 3.x 405B
  { match: "405b",              input: 1.79,  output: 1.79 },
  // Llama 3.x 70B (Groq versatile / NVIDIA NIM)
  { match: "70b",               input: 0.59,  output: 0.79 },
  // Llama 3.x 8B (Groq instant / NVIDIA NIM)
  { match: "8b",                input: 0.05,  output: 0.08 },
];

const DEFAULT_PRICING = { input: 0.05, output: 0.08 };

function getPricing(model: string): { input: number; output: number } {
  const lower = model.toLowerCase();
  for (const entry of PRICING_TABLE) {
    if (lower.includes(entry.match)) return entry;
  }
  return DEFAULT_PRICING;
}

export function computeCost(inputTokens: number, outputTokens: number, model = "") {
  const { input, output } = getPricing(model);
  const costUsd =
    (inputTokens / 1_000_000) * input +
    (outputTokens / 1_000_000) * output;
  return {
    costUsd,
    tokens: inputTokens + outputTokens,
  };
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${(usd * 100).toFixed(3)}¢`;
  return `$${usd.toFixed(4)}`;
}
