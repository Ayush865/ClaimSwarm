/**
 * Quick provider health check — fires one API call per configured slot and
 * reports latency, model name returned, and pass/fail.
 *
 * Usage:  npx tsx scripts/test-providers.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local manually (tsx doesn't auto-load it)
const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const val = trimmed.slice(eq + 1).trim();
  process.env[key] = val;
}

const PROMPT = 'Reply with exactly this JSON and nothing else: {"ok":true}';

interface ProviderDef {
  name: string;
  apiKey: string;
  baseURL: string;
  model: string;
  authHeader?: (key: string) => Record<string, string>;
}

function openaiProvider(name: string, key: string | undefined, baseURL: string, model: string): ProviderDef | null {
  if (!key) return null;
  return { name, apiKey: key, baseURL, model };
}

const providers: ProviderDef[] = [
  openaiProvider("nvidia-1 (DeepSeek)",   process.env.NVIDIA_API_KEY,    "https://integrate.api.nvidia.com/v1",                     process.env.NVIDIA_MODEL_FAST      ?? "deepseek-ai/deepseek-v4-flash"),
  openaiProvider("nvidia-2 (LLaMA)",      process.env.NVIDIA_API_KEY_2,  "https://integrate.api.nvidia.com/v1",                     process.env.NVIDIA_MODEL_2_FAST    ?? "meta/llama-3.1-8b-instruct"),
  openaiProvider("cerebras",              process.env.CEREBRAS_API_KEY,  "https://api.cerebras.ai/v1",                              process.env.CEREBRAS_MODEL_FAST    ?? "llama3.1-8b"),
  openaiProvider("cerebras-2",            process.env.CEREBRAS_API_KEY_2,"https://api.cerebras.ai/v1",                              process.env.CEREBRAS_MODEL_FAST    ?? "llama3.1-8b"),
  openaiProvider("sambanova",             process.env.SAMBANOVA_API_KEY,   "https://api.sambanova.ai/v1", process.env.SAMBANOVA_MODEL_FAST ?? "Meta-Llama-3.3-70B-Instruct"),
  openaiProvider("sambanova-2",           process.env.SAMBANOVA_API_KEY_2, "https://api.sambanova.ai/v1", process.env.SAMBANOVA_MODEL_FAST ?? "Meta-Llama-3.3-70B-Instruct"),
  openaiProvider("groq",                  process.env.GROQ_API_KEY,      "https://api.groq.com/openai/v1",                          process.env.GROQ_MODEL_FAST        ?? "llama-3.1-8b-instant"),
  openaiProvider("groq-2",               process.env.GROQ_API_KEY_2,    "https://api.groq.com/openai/v1",                          process.env.GROQ_MODEL_FAST        ?? "llama-3.1-8b-instant"),
].filter(Boolean) as ProviderDef[];

async function testProvider(p: ProviderDef, timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const resp = await fetch(`${p.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${p.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: p.model,
        messages: [
          { role: "system", content: "You are a JSON API. Return only valid JSON." },
          { role: "user",   content: PROMPT },
        ],
        temperature: 0,
        max_tokens: 512,
        response_format: { type: "json_object" },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    const ms = Date.now() - start;

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      const short = body.replace(/\n/g, " ").slice(0, 120);
      console.log(`  FAIL  ${p.name.padEnd(24)} ${resp.status}  ${short}`);
      return;
    }

    const data = await resp.json() as {
      choices?: { message?: { content?: string } }[];
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text  = data.choices?.[0]?.message?.content ?? "";
    const model = data.model ?? p.model;
    const tok   = data.usage ? `${data.usage.prompt_tokens ?? 0}in+${data.usage.completion_tokens ?? 0}out` : "";
    const ok    = text.includes('"ok"') || text.includes("true");
    const tag   = ok ? "  OK  " : " WARN ";
    console.log(`${tag}  ${p.name.padEnd(24)} ${ms}ms  model=${model}  ${tok}  resp=${text.replace(/\s+/g, " ").slice(0, 60)}`);
  } catch (err) {
    clearTimeout(timer);
    const ms = Date.now() - start;
    const isAbort = err instanceof Error && err.name === "AbortError";
    const msg = isAbort ? `TIMEOUT after ${ms}ms` : (err instanceof Error ? err.message : String(err));
    console.log(`  FAIL  ${p.name.padEnd(24)} ${msg}`);
  }
}

async function main() {
  console.log(`\nTesting ${providers.length} provider(s) — one call each, 20s timeout\n`);
  console.log(`${"STATUS".padEnd(8)}  ${"PROVIDER".padEnd(24)} LATENCY  DETAILS`);
  console.log("─".repeat(90));

  // Run all in parallel
  await Promise.all(providers.map((p) => testProvider(p)));
  console.log("\nDone.\n");
}

main().catch(console.error);
