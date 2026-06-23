/**
 * Live web search for the Axantilo coach — backs the `web_search` tool.
 *
 * Lets the coach look up tools/services it doesn't (reliably) know about
 * (e.g. a niche "onepage" website builder) and the *latest* features/pricing
 * of a tool. Uses Tavily, which is tuned for LLM use: it returns a short
 * synthesized `answer` plus the source snippets.
 *
 * Fail-open by design: if no `TAVILY_API_KEY` is set or the request fails,
 * it returns an empty result with a hint instead of throwing — the coach then
 * falls back to its own knowledge and is never blocked (mirrors searchKnowledge).
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResponse {
  /** Short synthesized answer to the query (Tavily `answer`), or null. */
  answer: string | null;
  /** Source results, most relevant first. */
  results: WebSearchResult[];
  /** Set when the search could not run (no key / error) — coach should use own knowledge. */
  note?: string;
}

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
}

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

/**
 * Search the web for `query`. Returns at most `maxResults` sources plus a
 * synthesized answer. Never throws.
 */
export async function searchWeb(
  query: string,
  maxResults = 5,
): Promise<WebSearchResponse> {
  const q = (query || '').trim();
  if (!q) {
    return { answer: null, results: [], note: 'Leere Suchanfrage.' };
  }

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn('[web_search] TAVILY_API_KEY missing — failing open.');
    return {
      answer: null,
      results: [],
      note: 'Keine Web-Suche konfiguriert — nutze dein eigenes Wissen.',
    };
  }

  try {
    const res = await fetch(TAVILY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: q,
        // 'advanced' extracts the most relevant content chunks per page (vs. generic
        // snippets) — needed so facts like pricing tiers actually appear in the results
        // instead of the model filling gaps from (stale) training knowledge.
        search_depth: 'advanced',
        include_answer: 'advanced',
        max_results: maxResults,
      }),
      // Web search should stay snappy inside the chat tool-loop.
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[web_search] Tavily ${res.status}: ${body.slice(0, 200)}`);
      return {
        answer: null,
        results: [],
        note: 'Web-Suche fehlgeschlagen — nutze dein eigenes Wissen.',
      };
    }

    const data = (await res.json()) as { answer?: string; results?: TavilyResult[] };
    const results: WebSearchResult[] = (Array.isArray(data.results) ? data.results : [])
      .slice(0, maxResults)
      .map((r) => ({
        title: (r.title || '').trim(),
        url: (r.url || '').trim(),
        snippet: (r.content || '').trim(),
      }))
      .filter((r) => r.snippet || r.title);

    const answer = typeof data.answer === 'string' && data.answer.trim() ? data.answer.trim() : null;
    return { answer, results };
  } catch (e) {
    console.error('[web_search] failed:', (e as Error)?.message);
    return {
      answer: null,
      results: [],
      note: 'Web-Suche nicht verfügbar — nutze dein eigenes Wissen.',
    };
  }
}
