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

export async function search(query: string, numResults = 5): Promise<SerperResult[]> {
  const key = normalizeQuery(query);
  if (cache.has(key)) return cache.get(key)!;

  try {
    const resp = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: numResults }),
    });

    if (!resp.ok) {
      console.warn(`Serper search failed: ${resp.status}`);
      return [];
    }

    const data = await resp.json();
    const results: SerperResult[] = (data.organic ?? [])
      .slice(0, numResults)
      .map((item: { snippet?: string; link?: string; title?: string; source?: string }) => ({
        snippet: item.snippet ?? "",
        url: item.link ?? "",
        title: item.title ?? "",
        source: item.source ?? new URL(item.link ?? "https://unknown").hostname,
      }));

    cache.set(key, results);
    return results;
  } catch (err) {
    console.warn("Serper search error:", err);
    return [];
  }
}
