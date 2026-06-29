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
 *
 * Model tiers per provider (set in .env.local):
 *   NVIDIA_MODEL_FAST / BALANCED / REASONING
 *   NVIDIA_MODEL_2_FAST / BALANCED / REASONING
 *   CEREBRAS_MODEL_FAST / BALANCED / REASONING
 *   SAMBANOVA_MODEL_FAST / BALANCED / REASONING
 *   GROQ_MODEL_FAST / BALANCED / REASONING
 *   GEMINI_MODEL_FAST / BALANCED / REASONING
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

  if (process.env.NVIDIA_API_KEY) {
    pool.push(def(
      "nvidia-1",
      process.env.NVIDIA_API_KEY,
      "https://integrate.api.nvidia.com/v1",
      process.env.NVIDIA_MODEL_FAST      ?? "deepseek-ai/deepseek-v4-flash",
      process.env.NVIDIA_MODEL_BALANCED  ?? "deepseek-ai/deepseek-v4-flash",
      process.env.NVIDIA_MODEL_REASONING ?? "deepseek-ai/deepseek-v4-flash",
    ));
  }

  if (process.env.NVIDIA_API_KEY_2) {
    pool.push(def(
      "nvidia-2",
      process.env.NVIDIA_API_KEY_2,
      "https://integrate.api.nvidia.com/v1",
      process.env.NVIDIA_MODEL_2_FAST      ?? "meta/llama-3.1-8b-instruct",
      process.env.NVIDIA_MODEL_2_BALANCED  ?? "meta/llama-3.1-8b-instruct",
      process.env.NVIDIA_MODEL_2_REASONING ?? "meta/llama-3.1-8b-instruct",
    ));
  }

  if (process.env.CEREBRAS_API_KEY) {
    pool.push(def(
      "cerebras",
      process.env.CEREBRAS_API_KEY,
      "https://api.cerebras.ai/v1",
      process.env.CEREBRAS_MODEL_FAST      ?? "llama3.1-8b",
      process.env.CEREBRAS_MODEL_BALANCED  ?? "llama-3.3-70b",
      process.env.CEREBRAS_MODEL_REASONING ?? "llama-3.3-70b",
    ));
  }

  if (process.env.SAMBANOVA_API_KEY) {
    pool.push(def(
      "sambanova",
      process.env.SAMBANOVA_API_KEY,
      "https://api.sambanova.ai/v1",
      process.env.SAMBANOVA_MODEL_FAST      ?? "Meta-Llama-3.1-8B-Instruct",
      process.env.SAMBANOVA_MODEL_BALANCED  ?? "Meta-Llama-3.3-70B-Instruct",
      process.env.SAMBANOVA_MODEL_REASONING ?? "Meta-Llama-3.1-405B-Instruct",
    ));
  }

  if (process.env.GROQ_API_KEY) {
    pool.push(def(
      "groq",
      process.env.GROQ_API_KEY,
      "https://api.groq.com/openai/v1",
      process.env.GROQ_MODEL_FAST      ?? "llama-3.1-8b-instant",
      process.env.GROQ_MODEL_BALANCED  ?? "llama-3.1-8b-instant",
      process.env.GROQ_MODEL_REASONING ?? "llama-3.3-70b-versatile",
    ));
  }

  if (process.env.GEMINI_API_KEY) {
    pool.push(def(
      "gemini",
      process.env.GEMINI_API_KEY,
      "https://generativelanguage.googleapis.com/v1beta/openai/",
      process.env.GEMINI_MODEL_FAST      ?? "gemini-2.0-flash",
      process.env.GEMINI_MODEL_BALANCED  ?? "gemini-1.5-flash",
      process.env.GEMINI_MODEL_REASONING ?? "gemini-1.5-pro",
    ));
  }

  return pool;
}

const POOL = buildPool();

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
        const result = await tryProvider(provider, schema, messages, tier, timeoutMs);
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
