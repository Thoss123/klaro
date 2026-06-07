import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import { mistralCompleteJson, safeParseJson } from '@/lib/agents/llm';

/**
 * Research endpoint (Phase 3) — backs the coach's `research_solutions` tool.
 *
 * Pipeline: an n8n webhook (Apify Google Search) returns raw web results for the
 * pain point; Mistral-Small then synthesizes 2–3 structured solution approaches
 * grounded in those results. If the webhook is absent/empty/failing, Mistral
 * generates approaches from model knowledge so the coach is never blocked.
 *
 * Output shape (stable contract for the coach):
 *   { options: [{ id, title, tools, automation_level, pros, cons }] }
 */

export interface SolutionOption {
  id: string;
  title: string;
  tools: string[];
  automation_level: 'manuell' | 'teilautomatisch' | 'vollautomatisch' | string;
  pros: string[];
  cons: string[];
}

interface SearchResult {
  title?: string;
  description?: string;
  url?: string;
}

interface ResearchInput {
  pain_point_id?: string;
  pain_point_title?: string;
  tools_mentioned?: string[];
  context?: string;
}

/** Coerce arbitrary JSON (from LLM) into a clean SolutionOption[]. */
function normalizeOptions(raw: unknown): SolutionOption[] {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.options)
      ? (raw as Record<string, unknown>).options
      : [];
  const toStrArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : [];
  return (arr as unknown[])
    .slice(0, 3)
    .map((o, i) => {
      const obj = (o || {}) as Record<string, unknown>;
      return {
        id: String(obj.id ?? i + 1),
        title: typeof obj.title === 'string' ? obj.title.trim() : `Ansatz ${i + 1}`,
        tools: toStrArr(obj.tools),
        automation_level:
          typeof obj.automation_level === 'string' ? obj.automation_level.trim() : 'teilautomatisch',
        pros: toStrArr(obj.pros),
        cons: toStrArr(obj.cons),
      };
    })
    .filter(o => o.title);
}

/** Fetch raw web search results from the n8n/Apify webhook (best-effort). */
async function searchViaN8n(webhook: string, input: ResearchInput): Promise<SearchResult[]> {
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    // Apify scraping can be slow; give it room but cap it.
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`n8n webhook ${res.status}`);
  const data = await res.json();
  const results = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
  return (results as SearchResult[]).slice(0, 8);
}

/**
 * Synthesize structured solution approaches via Mistral. When `searchResults`
 * are provided they ground the answer; otherwise pure model knowledge is used.
 */
async function synthesizeOptions(
  input: ResearchInput,
  searchResults: SearchResult[],
): Promise<SolutionOption[]> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return [];
  const complete = mistralCompleteJson(new Mistral({ apiKey }));

  const grounding = searchResults.length
    ? `\n\nWeb-Recherche (nutze sie als Grundlage, übernimm reale Tools/Ansätze):\n` +
      searchResults
        .map((r, i) => `${i + 1}. ${r.title || ''} — ${r.description || ''}`)
        .join('\n')
    : '';

  const system = `Du bist ein Recherche-Agent für KI-Automatisierung (Sprache: Deutsch).
Liefere 2–3 KONKRETE Lösungsansätze, wie man den genannten Pain Point mit KI/Automatisierung lösen kann.
Variiere den Automatisierungsgrad: ein eher manueller/leichter Ansatz, ein teilautomatischer, ein vollautomatischer.
Nenne echte, gängige Tools (bevorzugt Cloud, günstig: Google Docs/Sheets, Otter.ai, Mistral, HubSpot Free, n8n-fähige Tools).
Jeder Ansatz: kurzer Titel, Tools, automation_level, 2 pros, 1–2 cons. Keine Halluzination, keine erfundenen Tools.

Antworte AUSSCHLIESSLICH mit JSON:
{"options":[{"id":"1","title":"...","tools":["..."],"automation_level":"manuell|teilautomatisch|vollautomatisch","pros":["...","..."],"cons":["..."]}]}`;

  const user = `Pain Point: ${input.pain_point_title || '(unbekannt)'}
Bereits genutzte Tools: ${(input.tools_mentioned || []).join(', ') || '(keine genannt)'}
Kontext: ${input.context || '(keiner)'}${grounding}`;

  const { content } = await complete({ system, user });
  return normalizeOptions(safeParseJson(content));
}

export async function POST(req: NextRequest) {
  try {
    const input = (await req.json()) as ResearchInput;

    // 1. Best-effort web search via n8n/Apify.
    let searchResults: SearchResult[] = [];
    const webhook = process.env.N8N_RESEARCH_WEBHOOK_URL;
    if (webhook) {
      try {
        searchResults = await searchViaN8n(webhook, input);
      } catch (e: any) {
        console.warn('[research] n8n webhook failed, using model knowledge only:', e?.message);
      }
    }

    // 2. Synthesize structured options (grounded in search results when present).
    const options = await synthesizeOptions(input, searchResults);
    return NextResponse.json({
      options,
      source: searchResults.length ? 'n8n+llm' : 'llm',
      grounded: searchResults.length > 0,
    });
  } catch (error: any) {
    console.error('[research] error:', error?.message);
    // Never block the coach — return empty options on hard failure.
    return NextResponse.json({ options: [], source: 'error', error: error?.message });
  }
}
