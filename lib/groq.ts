/**
 * Provider-agnostic LLM client — works with any OpenAI-compatible endpoint.
 *
 * Three model tiers let each agent use a model sized for its reasoning load:
 *   fast      — trivial generation (aggregator summary sentence)
 *   balanced  — classification + pattern matching (extractor, github verifier)
 *   reasoning — critical evaluation, false-positive resistance (public verifier,
 *               internal consistency checker)
 *
 * Set tier-specific model vars; all fall back to LLM_MODEL if unset.
 *
 * Primary provider options (pick one):
 *
 *   Groq
 *     GROQ_API_KEY=<key>
 *     LLM_MODEL_FAST=llama-3.1-8b-instant
 *     LLM_MODEL_BALANCED=llama-3.1-8b-instant
 *     LLM_MODEL_REASONING=llama-3.1-8b-instant
 *
 *   NVIDIA NIM
 *     LLM_BASE_URL=https://integrate.api.nvidia.com/v1
 *     LLM_API_KEY=<nvidia key>
 *     LLM_MODEL_FAST=meta/llama-3.1-8b-instruct
 *     LLM_MODEL_BALANCED=meta/llama-3.1-70b-instruct
 *     LLM_MODEL_REASONING=meta/llama-3.1-405b-instruct
 *
 *   DeepSeek
 *     LLM_BASE_URL=https://api.deepseek.com
 *     LLM_API_KEY=<key>
 *     LLM_MODEL_FAST=deepseek-chat
 *     LLM_MODEL_BALANCED=deepseek-chat
 *     LLM_MODEL_REASONING=deepseek-reasoner
 *
 * Gemini fallback (automatic — kicks in when primary provider hard-fails):
 *   GEMINI_API_KEY=<key>          ← get from aistudio.google.com
 *   GEMINI_MODEL_FAST=gemini-2.0-flash        (optional, these are the defaults)
 *   GEMINI_MODEL_BALANCED=gemini-1.5-flash
 *   GEMINI_MODEL_REASONING=gemini-1.5-pro
 */

import OpenAI from "openai";
import { z } from "zod";

// ── Primary provider ──────────────────────────────────────────────────────────

const PRIMARY_BASE_URL =
  process.env.LLM_BASE_URL ??
  (process.env.GROQ_API_KEY
    ? "https://api.groq.com/openai/v1"
    : "https://integrate.api.nvidia.com/v1");

const PRIMARY_API_KEY =
  process.env.LLM_API_KEY ??
  process.env.GROQ_API_KEY ??
  process.env.NVIDIA_API_KEY ??
  process.env.DEEPSEEK_API_KEY ??
  "";

const MODEL_DEFAULT =
  process.env.LLM_MODEL ??
  process.env.GROQ_MODEL ??
  "meta/llama-3.1-8b-instruct";

export const MODEL_FAST      = process.env.LLM_MODEL_FAST      ?? MODEL_DEFAULT;
export const MODEL_BALANCED  = process.env.LLM_MODEL_BALANCED  ?? MODEL_DEFAULT;
export const MODEL_REASONING = process.env.LLM_MODEL_REASONING ?? MODEL_DEFAULT;

// ── Gemini fallback ───────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

const GEMINI_MODEL_FAST      = process.env.GEMINI_MODEL_FAST      ?? "gemini-2.0-flash";
const GEMINI_MODEL_BALANCED  = process.env.GEMINI_MODEL_BALANCED  ?? "gemini-1.5-flash";
const GEMINI_MODEL_REASONING = process.env.GEMINI_MODEL_REASONING ?? "gemini-1.5-pro";

// ── Clients ───────────────────────────────────────────────────────────────────

const primaryClient = new OpenAI({ apiKey: PRIMARY_API_KEY, baseURL: PRIMARY_BASE_URL });

// Gemini client is only created when a key is provided
const geminiClient = GEMINI_API_KEY
  ? new OpenAI({ apiKey: GEMINI_API_KEY, baseURL: GEMINI_BASE_URL })
  : null;

export type ModelTier = "fast" | "balanced" | "reasoning";

function resolveModel(tier?: ModelTier): string {
  switch (tier) {
    case "fast":      return MODEL_FAST;
    case "balanced":  return MODEL_BALANCED;
    case "reasoning": return MODEL_REASONING;
    default:          return MODEL_DEFAULT;
  }
}

function resolveGeminiModel(tier?: ModelTier): string {
  switch (tier) {
    case "fast":      return GEMINI_MODEL_FAST;
    case "balanced":  return GEMINI_MODEL_BALANCED;
    case "reasoning": return GEMINI_MODEL_REASONING;
    default:          return GEMINI_MODEL_FAST;
  }
}

// 2 retries × ~15s wait = 30s max per failed call, safe within Vercel's 60s cap.
// Increase via LLM_MAX_RETRIES on a paid tier with a higher function timeout.
const MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES ?? 2);

export interface ChatJSONResult<T> {
  data: T;
  tokens: { input: number; output: number };
  model: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
}

function parseRetryAfterMs(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/try again in (\d+\.?\d*)s/i);
  if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 1500;
  const headers = (err as { headers?: Record<string, string> })?.headers;
  const ra = headers?.["retry-after"];
  if (ra && !isNaN(Number(ra))) return Math.ceil(Number(ra) * 1000) + 1500;
  return 15000;
}

function tryParse<T>(schema: z.ZodSchema<T>, raw: string): T | null {
  try {
    const obj = JSON.parse(stripFences(raw));
    const result = schema.safeParse(obj);
    if (!result.success) {
      console.warn("[llm] Zod issues:", result.error.issues.slice(0, 3));
    }
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// ── Core retry loop (client-agnostic) ────────────────────────────────────────

async function callWithRetry(
  client: OpenAI,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  model: string,
  timeoutMs: number,
  maxRetries = MAX_RETRIES
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const waitMs = parseRetryAfterMs(lastErr);
      console.log(`[llm] retry ${attempt}/${maxRetries - 1} — waiting ${(waitMs / 1000).toFixed(1)}s (${model})`);
      await sleep(waitMs);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await client.chat.completions.create(
        { model, messages, temperature: 0, max_tokens: 1024, response_format: { type: "json_object" } },
        { signal: controller.signal }
      );
      clearTimeout(timer);
      return resp;
    } catch (err: unknown) {
      clearTimeout(timer);
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const isRetryable = status === 429 || (status !== undefined && status >= 500);
      const isAbort = err instanceof Error && (err.name === "AbortError" || err.message?.includes("abort"));
      if (!isRetryable && !isAbort) throw err;
      console.warn(`[llm] attempt ${attempt + 1} failed: status=${status} model=${model}`);
    }
  }

  throw lastErr;
}

// ── Attempt one full call+repair cycle on a given client ─────────────────────

async function tryWithClient<T>(
  client: OpenAI,
  schema: z.ZodSchema<T>,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  model: string,
  timeoutMs: number
): Promise<ChatJSONResult<T> | null> {
  try {
    const resp = await callWithRetry(client, messages, model, timeoutMs);
    const raw = resp.choices[0]?.message?.content ?? "{}";
    const tokens = { input: resp.usage?.prompt_tokens ?? 0, output: resp.usage?.completion_tokens ?? 0 };

    const parsed = tryParse(schema, raw);
    if (parsed !== null) return { data: parsed, tokens, model: resp.model };

    // Repair pass on the same client
    console.warn(`[llm] schema parse failed on ${model}, attempting repair`);
    const repairResp = await callWithRetry(
      client,
      [
        ...messages,
        { role: "assistant" as const, content: raw },
        {
          role: "user" as const,
          content:
            'Your previous response did not match the required JSON schema. Return ONLY this exact JSON shape:\n{"verdict":"SUPPORTED|REFUTED|UNVERIFIABLE|SUSPICIOUS","confidence":0.0,"evidence":[{"snippet":"...","url":"...","source":"..."}],"reasoning":"..."}',
        },
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

    console.error(`[llm] repair failed on ${model}`);
    return null;
  } catch {
    return null;
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function chatJSON<T>(
  schema: z.ZodSchema<T>,
  system: string,
  user: string,
  fallback: T,
  timeoutMs = 30000,
  tier?: ModelTier
): Promise<ChatJSONResult<T>> {
  const primaryModel = resolveModel(tier);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  // 1. Try primary provider
  const primaryResult = await tryWithClient(primaryClient, schema, messages, primaryModel, timeoutMs);
  if (primaryResult !== null) return primaryResult;

  // 2. Primary hard-failed — try Gemini if configured
  if (geminiClient) {
    const geminiModel = resolveGeminiModel(tier);
    console.warn(`[llm] primary failed (${primaryModel}), falling back to Gemini (${geminiModel})`);
    const geminiResult = await tryWithClient(geminiClient, schema, messages, geminiModel, timeoutMs);
    if (geminiResult !== null) return geminiResult;
    console.error(`[llm] Gemini fallback also failed (${geminiModel})`);
  }

  // 3. Both failed — return safe hardcoded fallback
  console.error("[llm] all providers failed, returning hardcoded fallback");
  return { data: fallback, tokens: { input: 0, output: 0 }, model: primaryModel };
}
