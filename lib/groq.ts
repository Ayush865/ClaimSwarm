/**
 * Multi-provider LLM client with round-robin load distribution.
 *
 * Providers are tried in rotation. On 429, the provider is marked rate-limited
 * and the next call immediately goes to a different provider — no waiting.
 * If every provider is rate-limited, we wait for the soonest unblock.
 *
 * Provider priority order (first configured wins the next slot):
 *   1. NVIDIA NIM account 1  — NVIDIA_API_KEY
 *   2. NVIDIA NIM account 2  — NVIDIA_API_KEY_2
 *   3. Cerebras              — CEREBRAS_API_KEY
 *   4. SambaNova             — SAMBANOVA_API_KEY
 *   5. Groq                  — GROQ_API_KEY
 *   6. Gemini                — GEMINI_API_KEY  (most generous TPM, last resort)
 *   7. Ollama (local)        — USE_OLLAMA=true (offline fallback, always last)
 *
 * Model tiers per provider (set in .env.local):
 *   NVIDIA_MODEL_FAST / BALANCED / REASONING
 *   NVIDIA_MODEL_2_FAST / BALANCED / REASONING
 *   CEREBRAS_MODEL_FAST / BALANCED / REASONING
 *   SAMBANOVA_MODEL_FAST / BALANCED / REASONING
 *   GROQ_MODEL_FAST / BALANCED / REASONING
 *   GEMINI_MODEL_FAST / BALANCED / REASONING
 *   OLLAMA_MODEL_FAST / BALANCED / REASONING  (defaults: qwen2.5:7b / qwen2.5:14b / qwen2.5:14b)
 *   OLLAMA_BASE_URL                            (default: http://localhost:11434/v1)
 */

import OpenAI from "openai";
import { z } from "zod";

export type ModelTier = "fast" | "balanced" | "reasoning";

// ── Provider registry ─────────────────────────────────────────────────────────

interface ProviderDef {
  name: string;
  client: OpenAI;
  models: Record<ModelTier, string>;
}

function def(
  name: string,
  apiKey: string,
  baseURL: string,
  fast: string,
  balanced: string,
  reasoning: string
): ProviderDef {
  return {
    name,
    client: new OpenAI({ apiKey, baseURL }),
    models: { fast, balanced, reasoning },
  };
}

function buildPool(): ProviderDef[] {
  const pool: ProviderDef[] = [];
  const NIM          = "https://integrate.api.nvidia.com/v1";
  const GROQ_URL     = "https://api.groq.com/openai/v1";
  const CEREBRAS_URL = "https://api.cerebras.ai/v1";
  const SAMBANOVA_URL = "https://api.sambanova.ai/v1";

  // ── Priority 1: fresh Groq keys (3-6) ────────────────────────────────────
  for (const [name, key] of [
    ["groq-3", process.env.GROQ_API_KEY_3],
    ["groq-4", process.env.GROQ_API_KEY_4],
    ["groq-5", process.env.GROQ_API_KEY_5],
    ["groq-6", process.env.GROQ_API_KEY_6],
  ] as [string, string | undefined][]) {
    if (key) pool.push(def(name, key, GROQ_URL,
      process.env.GROQ_MODEL_FAST      ?? "llama-3.1-8b-instant",
      process.env.GROQ_MODEL_BALANCED  ?? "llama-3.1-8b-instant",
      process.env.GROQ_MODEL_REASONING ?? "llama-3.3-70b-versatile",
    ));
  }

  // ── Priority 2: fresh NVIDIA keys (3-4) ──────────────────────────────────
  if (process.env.NVIDIA_API_KEY_3) {
    pool.push(def("nvidia-3", process.env.NVIDIA_API_KEY_3, NIM,
      process.env.NVIDIA_MODEL_3_FAST      ?? "meta/llama-3.1-8b-instruct",
      process.env.NVIDIA_MODEL_3_BALANCED  ?? "meta/llama-3.1-8b-instruct",
      process.env.NVIDIA_MODEL_3_REASONING ?? "meta/llama-3.1-8b-instruct",
    ));
  }

  if (process.env.NVIDIA_API_KEY_4) {
    pool.push(def("nvidia-4", process.env.NVIDIA_API_KEY_4, NIM,
      process.env.NVIDIA_MODEL_4_FAST      ?? "minimaxai/minimax-m2.7",
      process.env.NVIDIA_MODEL_4_BALANCED  ?? "minimaxai/minimax-m2.7",
      process.env.NVIDIA_MODEL_4_REASONING ?? "minimaxai/minimax-m2.7",
    ));
  }

  // ── Priority 3: fresh SambaNova keys (3-4) ───────────────────────────────
  for (const [name, key] of [
    ["sambanova-3", process.env.SAMBANOVA_API_KEY_3],
    ["sambanova-4", process.env.SAMBANOVA_API_KEY_4],
  ] as [string, string | undefined][]) {
    if (key) pool.push(def(name, key, SAMBANOVA_URL,
      process.env.SAMBANOVA_MODEL_FAST      ?? "Meta-Llama-3.3-70B-Instruct",
      process.env.SAMBANOVA_MODEL_BALANCED  ?? "Meta-Llama-3.3-70B-Instruct",
      process.env.SAMBANOVA_MODEL_REASONING ?? "Meta-Llama-3.3-70B-Instruct",
    ));
  }

  // ── Lower priority: existing keys (rate limits partially used) ────────────
  if (process.env.NVIDIA_API_KEY_2) {
    pool.push(def("nvidia-2", process.env.NVIDIA_API_KEY_2, NIM,
      process.env.NVIDIA_MODEL_2_FAST      ?? "meta/llama-3.1-8b-instruct",
      process.env.NVIDIA_MODEL_2_BALANCED  ?? "meta/llama-3.1-8b-instruct",
      process.env.NVIDIA_MODEL_2_REASONING ?? "meta/llama-3.1-8b-instruct",
    ));
  }

  if (process.env.NVIDIA_API_KEY) {
    pool.push(def("nvidia-1", process.env.NVIDIA_API_KEY, NIM,
      process.env.NVIDIA_MODEL_FAST      ?? "deepseek-ai/deepseek-v4-flash",
      process.env.NVIDIA_MODEL_BALANCED  ?? "deepseek-ai/deepseek-v4-flash",
      process.env.NVIDIA_MODEL_REASONING ?? "deepseek-ai/deepseek-v4-flash",
    ));
  }

  for (const [name, key] of [
    ["groq",   process.env.GROQ_API_KEY],
    ["groq-2", process.env.GROQ_API_KEY_2],
  ] as [string, string | undefined][]) {
    if (key) pool.push(def(name, key, GROQ_URL,
      process.env.GROQ_MODEL_FAST      ?? "llama-3.1-8b-instant",
      process.env.GROQ_MODEL_BALANCED  ?? "llama-3.1-8b-instant",
      process.env.GROQ_MODEL_REASONING ?? "llama-3.3-70b-versatile",
    ));
  }

  for (const [name, key] of [
    ["cerebras",   process.env.CEREBRAS_API_KEY],
    ["cerebras-2", process.env.CEREBRAS_API_KEY_2],
  ] as [string, string | undefined][]) {
    if (key) pool.push(def(name, key, CEREBRAS_URL,
      process.env.CEREBRAS_MODEL_FAST      ?? "gpt-oss-120b",
      process.env.CEREBRAS_MODEL_BALANCED  ?? "gpt-oss-120b",
      process.env.CEREBRAS_MODEL_REASONING ?? "gpt-oss-120b",
    ));
  }

  for (const [name, key] of [
    ["sambanova",   process.env.SAMBANOVA_API_KEY],
    ["sambanova-2", process.env.SAMBANOVA_API_KEY_2],
  ] as [string, string | undefined][]) {
    if (key) pool.push(def(name, key, SAMBANOVA_URL,
      process.env.SAMBANOVA_MODEL_FAST      ?? "Meta-Llama-3.3-70B-Instruct",
      process.env.SAMBANOVA_MODEL_BALANCED  ?? "Meta-Llama-3.3-70B-Instruct",
      process.env.SAMBANOVA_MODEL_REASONING ?? "Meta-Llama-3.3-70B-Instruct",
    ));
  }

  // Ollama: local fallback, only used when USE_OLLAMA=true (avoids cold-routing
  // to localhost when Ollama isn't running). Always appended last so cloud
  // providers are tried first.
  if (process.env.USE_OLLAMA === "true") {
    pool.push(def(
      "ollama",
      "ollama",  // Ollama ignores the key but the OpenAI client requires a non-empty string
      process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
      process.env.OLLAMA_MODEL_FAST      ?? "qwen2.5:7b",
      process.env.OLLAMA_MODEL_BALANCED  ?? "qwen2.5:7b",
      process.env.OLLAMA_MODEL_REASONING ?? "qwen2.5:7b",
    ));
  }

  return pool;
}

const POOL = buildPool();

// ── Claude override (USE_CLAUDE=true bypasses the round-robin pool) ───────────
// Set USE_CLAUDE=true and ANTHROPIC_API_KEY in .env.local to route every call
// through Claude Haiku. The round-robin pool stays intact — flip the flag to revert.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const CLAUDE_MODEL       = process.env.CLAUDE_MODEL ?? "claude-haiku-4-5-20251001";
const USE_CLAUDE         = process.env.USE_CLAUDE === "true";

// ── Ollama-only override (USE_OLLAMA_ONLY=true bypasses the round-robin pool) ──
const OLLAMA_BASE_URL_  = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
const OLLAMA_MODEL_ONLY = process.env.OLLAMA_MODEL_FAST ?? "qwen2.5:7b";
const USE_OLLAMA_ONLY   = process.env.USE_OLLAMA_ONLY === "true";

const ollamaClient = new OpenAI({ apiKey: "ollama", baseURL: OLLAMA_BASE_URL_ });

async function callClaude<T>(
  schema: z.ZodSchema<T>,
  system: string,
  user: string,
  timeoutMs: number
): Promise<ChatJSONResult<T> | null> {
  if (!ANTHROPIC_API_KEY) {
    console.error("[claude] ANTHROPIC_API_KEY not set");
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  type AnthropicResp = { text: string; input: number; output: number };

  async function anthropicCall(messages: { role: string; content: string }[]): Promise<AnthropicResp | null> {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1024, temperature: 0, system, messages }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        console.error(`[claude] HTTP ${resp.status}: ${body.slice(0, 200)}`);
        return null;
      }
      const data = await resp.json() as { content?: { text: string }[]; usage?: { input_tokens: number; output_tokens: number } };
      const text = data.content?.[0]?.text ?? "";
      return { text, input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 };
    } catch (err) {
      console.error("[claude] fetch error:", (err as Error)?.message ?? err);
      return null;
    }
  }

  try {
    const userMsg = [{ role: "user", content: user }];
    const first = await anthropicCall(userMsg);
    clearTimeout(timer);
    if (!first) return null;

    const tokens = { input: first.input, output: first.output };
    const parsed = tryParse(schema, first.text);
    if (parsed !== null) return { data: parsed, tokens, model: CLAUDE_MODEL };

    console.warn("[claude] schema parse failed, attempting repair");
    const repair = await anthropicCall([
      ...userMsg,
      { role: "assistant", content: first.text },
      { role: "user", content: "Your response did not match the required JSON schema. Re-read the system prompt and return ONLY valid JSON, no markdown fences, no extra text." },
    ]);
    if (!repair) return null;

    const repairTokens = { input: tokens.input + repair.input, output: tokens.output + repair.output };
    const repaired = tryParse(schema, repair.text);
    if (repaired !== null) return { data: repaired, tokens: repairTokens, model: CLAUDE_MODEL };

    console.error("[claude] repair also failed");
    return null;
  } catch (err) {
    clearTimeout(timer);
    console.error("[claude] unexpected error:", (err as Error)?.message ?? err);
    return null;
  }
}

// ── Round-robin + rate-limit state ────────────────────────────────────────────
// Module-level: persists across parallel calls within the same serverless instance.

let rrCursor = 0;
const blockedUntil = new Map<string, number>(); // provider → unblock timestamp

function markBlocked(name: string, ms: number) {
  blockedUntil.set(name, Date.now() + ms);
  console.warn(`[llm] ${name} rate-limited for ${(ms / 1000).toFixed(0)}s`);
}

function isBlocked(name: string): boolean {
  return (blockedUntil.get(name) ?? 0) > Date.now();
}

// Returns the index of the starting provider for a new call (round-robin).
// Advances the cursor so concurrent calls start from different providers.
function startIndex(): number {
  const idx = rrCursor % POOL.length;
  rrCursor++;
  return idx;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export interface ChatJSONResult<T> {
  data: T;
  tokens: { input: number; output: number };
  model: string;
}

// Exported for cost.ts model-name matching
export const MODEL_FAST      = process.env.NVIDIA_MODEL_FAST      ?? "deepseek-ai/deepseek-v4-flash";
export const MODEL_BALANCED  = process.env.NVIDIA_MODEL_BALANCED  ?? "deepseek-ai/deepseek-v4-flash";
export const MODEL_REASONING = process.env.NVIDIA_MODEL_REASONING ?? "deepseek-ai/deepseek-v4-flash";

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
}

function parseRetryAfterMs(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/try again in (\d+\.?\d*)s/i);
  if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 500;
  const headers = (err as { headers?: Record<string, string> })?.headers;
  const ra = headers?.["retry-after"];
  if (ra && !isNaN(Number(ra))) return Math.ceil(Number(ra) * 1000) + 500;
  return 20000;
}

function tryParse<T>(schema: z.ZodSchema<T>, raw: string): T | null {
  try {
    const obj = JSON.parse(stripFences(raw));
    const r = schema.safeParse(obj);
    if (!r.success) console.warn("[llm] Zod issues:", r.error.issues.slice(0, 3));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

const JSON_MODE = process.env.LLM_JSON_MODE !== "false";

// ── Single HTTP call ──────────────────────────────────────────────────────────

async function singleCall(
  client: OpenAI,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  model: string,
  timeoutMs: number
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await client.chat.completions.create(
      {
        model, messages, temperature: 0, max_tokens: 1024,
        ...(JSON_MODE ? { response_format: { type: "json_object" } } : {}),
      },
      { signal: controller.signal }
    );
    clearTimeout(timer);
    return resp;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ── Per-provider attempt (call + optional repair) ─────────────────────────────

async function tryProvider<T>(
  provider: ProviderDef,
  schema: z.ZodSchema<T>,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  tier: ModelTier,
  timeoutMs: number
): Promise<ChatJSONResult<T>> {
  const model = provider.models[tier];
  const resp = await singleCall(provider.client, messages, model, timeoutMs);
  const raw = resp.choices[0]?.message?.content ?? "{}";
  const tokens = { input: resp.usage?.prompt_tokens ?? 0, output: resp.usage?.completion_tokens ?? 0 };

  const parsed = tryParse(schema, raw);
  if (parsed !== null) return { data: parsed, tokens, model: resp.model };

  // One repair pass on the same provider
  console.warn(`[llm] schema parse failed on ${provider.name}/${model}, attempting repair`);
  const repairResp = await singleCall(
    provider.client,
    [
      ...messages,
      { role: "assistant" as const, content: raw },
      { role: "user" as const, content: "Your response did not match the required JSON schema. Re-read the system prompt and return ONLY valid JSON, no markdown fences, no extra text." },
    ],
    model,
    timeoutMs
  );
  const repairRaw = repairResp.choices[0]?.message?.content ?? "{}";
  const repairTokens = {
    input: tokens.input + (repairResp.usage?.prompt_tokens ?? 0),
    output: tokens.output + (repairResp.usage?.completion_tokens ?? 0),
  };

  const repaired = tryParse(schema, repairRaw);
  if (repaired !== null) return { data: repaired, tokens: repairTokens, model: resp.model };

  throw new Error(`schema-parse-failed:${provider.name}`);
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function chatJSON<T>(
  schema: z.ZodSchema<T>,
  system: string,
  user: string,
  fallback: T,
  timeoutMs = 45000,
  tier: ModelTier = "fast"
): Promise<ChatJSONResult<T>> {
  if (POOL.length === 0) {
    console.error("[llm] no providers configured");
    return { data: fallback, tokens: { input: 0, output: 0 }, model: "none" };
  }

  // Claude override: bypass round-robin entirely when USE_CLAUDE=true
  if (USE_CLAUDE) {
    const result = await callClaude(schema, system, user, timeoutMs);
    if (result !== null) return result;
    console.error("[claude] failed — returning hardcoded fallback (round-robin is disabled)");
    return { data: fallback, tokens: { input: 0, output: 0 }, model: "none" };
  }

  // Ollama-only override: bypass round-robin entirely when USE_OLLAMA_ONLY=true
  if (USE_OLLAMA_ONLY) {
    const ollamaTimeoutMs = Math.max(timeoutMs, Number(process.env.OLLAMA_TIMEOUT_MS ?? 120000));
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    try {
      const ollamaProv: ProviderDef = {
        name: "ollama",
        client: ollamaClient,
        models: { fast: OLLAMA_MODEL_ONLY, balanced: OLLAMA_MODEL_ONLY, reasoning: OLLAMA_MODEL_ONLY },
      };
      return await tryProvider(ollamaProv, schema, messages, tier, ollamaTimeoutMs);
    } catch (err) {
      console.error("[ollama] failed —", (err as Error)?.message ?? err);
      return { data: fallback, tokens: { input: 0, output: 0 }, model: "none" };
    }
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  // Round-robin picks which provider gets the FIRST attempt for this call.
  // On failure, we walk sequentially through ALL remaining providers — never skipping one.
  const start = startIndex();

  async function tryAll(skipBlocked: boolean): Promise<ChatJSONResult<T> | null> {
    for (let i = 0; i < POOL.length; i++) {
      const provider = POOL[(start + i) % POOL.length];
      if (skipBlocked && isBlocked(provider.name)) continue;

      try {
        const effectiveTimeout = provider.name === "ollama"
          ? Math.max(timeoutMs, Number(process.env.OLLAMA_TIMEOUT_MS ?? 120000))
          : timeoutMs;
        const result = await tryProvider(provider, schema, messages, tier, effectiveTimeout);
        if (i > 0) console.log(`[llm] succeeded on ${provider.name} after ${i} skip(s)`);
        return result;
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        const isAbort = err instanceof Error && (err.name === "AbortError" || err.message?.includes("abort"));

        if (status === 429) {
          markBlocked(provider.name, parseRetryAfterMs(err));
        } else if (isAbort) {
          console.warn(`[llm] ${provider.name} timed out (${timeoutMs}ms)`);
        } else {
          const msg = (err as Error)?.message ?? String(err);
          console.warn(`[llm] ${provider.name} failed: ${msg}`);
        }
        // always continue to next provider
      }
    }
    return null;
  }

  // Pass 1: try all non-blocked providers in sequence
  const first = await tryAll(true);
  if (first !== null) return first;

  // Pass 2: all were blocked — wait for the soonest to unblock, then sweep again
  const soonestMs = Math.min(...POOL.map((p) => blockedUntil.get(p.name) ?? 0)) - Date.now();
  const wait = Math.max(soonestMs + 500, 1000);
  console.log(`[llm] all providers blocked, waiting ${(wait / 1000).toFixed(1)}s then retrying`);
  await sleep(wait);

  const second = await tryAll(false);
  if (second !== null) return second;

  console.error("[llm] all providers exhausted, returning hardcoded fallback");
  return { data: fallback, tokens: { input: 0, output: 0 }, model: "none" };
}
