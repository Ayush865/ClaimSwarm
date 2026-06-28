/**
 * Provider-agnostic LLM client — works with any OpenAI-compatible endpoint.
 *
 * Supported providers (set via env vars):
 *
 *   Groq (default)
 *     LLM_BASE_URL=https://api.groq.com/openai/v1
 *     LLM_API_KEY=<groq key>
 *     LLM_MODEL=llama-3.1-8b-instant
 *
 *   NVIDIA NIM (recommended — generous free tier)
 *     LLM_BASE_URL=https://integrate.api.nvidia.com/v1
 *     LLM_API_KEY=<nvidia key>
 *     LLM_MODEL=meta/llama-3.1-8b-instruct
 *
 *   DeepSeek
 *     LLM_BASE_URL=https://api.deepseek.com
 *     LLM_API_KEY=<deepseek key>
 *     LLM_MODEL=deepseek-chat
 */

import OpenAI from "openai";
import { z } from "zod";

const BASE_URL =
  process.env.LLM_BASE_URL ??
  (process.env.GROQ_API_KEY
    ? "https://api.groq.com/openai/v1"
    : "https://integrate.api.nvidia.com/v1");

const API_KEY =
  process.env.LLM_API_KEY ??
  process.env.GROQ_API_KEY ??
  process.env.NVIDIA_API_KEY ??
  process.env.DEEPSEEK_API_KEY ??
  "";

const MODEL =
  process.env.LLM_MODEL ??
  process.env.GROQ_MODEL ??
  "meta/llama-3.1-8b-instruct";

const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });

const MAX_RETRIES = 4;

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

/** Extract wait time from provider 429 messages, e.g. "try again in 8.96s" */
function parseRetryAfterMs(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/try again in (\d+\.?\d*)s/i);
  if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 1500;
  const headers = (err as { headers?: Record<string, string> })?.headers;
  const ra = headers?.["retry-after"];
  if (ra && !isNaN(Number(ra))) return Math.ceil(Number(ra) * 1000) + 1500;
  return 15000;
}

async function callWithRetry(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  timeoutMs: number
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  let lastErr: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const waitMs = parseRetryAfterMs(lastErr);
      console.log(`[llm] retry ${attempt}/${MAX_RETRIES - 1} — waiting ${(waitMs / 1000).toFixed(1)}s`);
      await sleep(waitMs);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await client.chat.completions.create(
        {
          model: MODEL,
          messages,
          temperature: 0,
          max_tokens: 1024,
          response_format: { type: "json_object" },
        },
        { signal: controller.signal }
      );
      clearTimeout(timer);
      return resp;
    } catch (err: unknown) {
      clearTimeout(timer);
      lastErr = err;

      const status = (err as { status?: number })?.status;
      const isRetryable = status === 429 || (status !== undefined && status >= 500);
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" || err.message?.includes("abort"));

      if (!isRetryable && !isAbort) throw err;
      console.warn(`[llm] attempt ${attempt + 1} failed: status=${status}`);
    }
  }

  throw lastErr;
}

export async function chatJSON<T>(
  schema: z.ZodSchema<T>,
  system: string,
  user: string,
  fallback: T,
  timeoutMs = 30000
): Promise<ChatJSONResult<T>> {
  try {
    const resp = await callWithRetry(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      timeoutMs
    );

    const raw = resp.choices[0]?.message?.content ?? "{}";
    const tokens = {
      input: resp.usage?.prompt_tokens ?? 0,
      output: resp.usage?.completion_tokens ?? 0,
    };

    const parsed = tryParse(schema, raw);
    if (parsed !== null) return { data: parsed, tokens, model: resp.model };

    console.warn("[llm] schema parse failed, attempting repair");
    const repairResp = await callWithRetry(
      [
        { role: "system", content: system },
        { role: "user", content: user },
        { role: "assistant", content: raw },
        {
          role: "user",
          content:
            'Your previous response did not match the required JSON schema. Return ONLY this exact JSON shape:\n{"verdict":"SUPPORTED|REFUTED|UNVERIFIABLE|SUSPICIOUS","confidence":0.0,"evidence":[{"snippet":"...","url":"...","source":"..."}],"reasoning":"..."}',
        },
      ],
      timeoutMs
    );

    const repairRaw = repairResp.choices[0]?.message?.content ?? "{}";
    const repairTokens = {
      input: tokens.input + (repairResp.usage?.prompt_tokens ?? 0),
      output: tokens.output + (repairResp.usage?.completion_tokens ?? 0),
    };

    const repaired = tryParse(schema, repairRaw);
    if (repaired !== null) return { data: repaired, tokens: repairTokens, model: resp.model };

    console.error("[llm] repair failed, using fallback");
    return { data: fallback, tokens: repairTokens, model: MODEL };
  } catch (err) {
    console.error("[llm] hard failure after retries:", (err as Error)?.message ?? err);
    return { data: fallback, tokens: { input: 0, output: 0 }, model: MODEL };
  }
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
