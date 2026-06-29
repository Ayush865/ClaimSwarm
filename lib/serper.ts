export interface SerperResult {
  snippet: string;
  url: string;
  title: string;
  source: string;
}

const cache = new Map<string, SerperResult[]>();

function normalizeQuery(q: string) {
  return q.toLowerCase().trim().replace(/\s+/g, " ");
}

const SERPER_KEYS = [
  process.env.SERPER_API_KEY,
  process.env.SERPER_API_KEY_FALLBACK,
  process.env.SERPER_API_KEY_3,
  process.env.SERPER_API_KEY_4,
].filter(Boolean) as string[];

// Round-robin cursor — claim 1 starts on key 0, claim 2 on key 1, etc.
// On failure, the same call walks sequentially through all remaining keys.
let rrCursor = 0;

function startIndex(): number {
  const idx = rrCursor % SERPER_KEYS.length;
  rrCursor++;
  return idx;
}

async function serperFetch(apiKey: string, query: string, numResults: number): Promise<SerperResult[] | null> {
  try {
    const resp = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: numResults }),
    });

    if (!resp.ok) {
      console.warn(`[serper] key ...${apiKey.slice(-6)} failed: ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    return (data.organic ?? [])
      .slice(0, numResults)
      .map((item: { snippet?: string; link?: string; title?: string; source?: string }) => ({
        snippet: item.snippet ?? "",
        url: item.link ?? "",
        title: item.title ?? "",
        source: item.source ?? new URL(item.link ?? "https://unknown").hostname,
      }));
  } catch (err) {
    console.warn(`[serper] key ...${apiKey.slice(-6)} error:`, err);
    return null;
  }
}

export async function search(query: string, numResults = 5): Promise<SerperResult[]> {
  const cacheKey = normalizeQuery(query);
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  if (SERPER_KEYS.length === 0) return [];

  const start = startIndex();
  for (let i = 0; i < SERPER_KEYS.length; i++) {
    const key = SERPER_KEYS[(start + i) % SERPER_KEYS.length];
    const results = await serperFetch(key, query, numResults);
    if (results !== null) {
      cache.set(cacheKey, results);
      return results;
    }
  }

  console.warn("[serper] all keys exhausted for query:", query);
  return [];
}
