/**
 * Topic Research Agent (Sprint 3.2) — session-specific, Phase `plan` only.
 *
 * Input: last N chat messages + active pain point + tools from canvas.
 * Output: a short ResearchBrief the Canvas Worker can fold into the workflow.
 *
 * For now LLM + canvas context only (no live web). Tool-hooks (YouTube,
 * web-search via n8n subworkflows) plug in later behind the same interface.
 */

import type { AgentMessage, AgentResult, ResearchBrief } from './types';
import { asStringArray, type CompleteJson, estimateTokens, safeParseJson } from './llm';
import { renderChatSlice } from './supervisor';

export interface ResearchInput {
  topic: string;
  painPointTitle: string;
  tools: string[];
  history: AgentMessage[];
}

/** Cheap heuristic: does this topic plausibly benefit from research? */
export function topicNeedsResearch(topic: string, painPointTitle: string): boolean {
  const blob = `${topic} ${painPointTitle}`.toLowerCase();
  if (blob.trim().length < 4) return false;
  // Pure admin/data-entry rarely needs creative recherche; content/marketing does.
  const researchy = /content|video|reel|post|marketing|recherche|skript|seo|ad|kampagne|social|blog|newsletter|akquise|lead/;
  return researchy.test(blob);
}

export function buildResearchPrompt(input: ResearchInput): { system: string; user: string } {
  const system = `Du bist ein Recherche-Agent in einer KI-Beratungs-Pipeline (unsichtbar für den Nutzer).
Aufgabe: Liefere kompakte, FAKTISCHE Hinweise, die helfen, einen Automatisierungs-Workflow für genau dieses Thema sinnvoll und in richtiger Reihenfolge zu bauen.

Strenge Regeln:
- Keine Halluzination. Wenn du zu einem Punkt nichts Belastbares weißt, lass ihn weg.
- Bullets sind kurz (max. ~12 Wörter), umsetzungsnah (z.B. "Clipping/Schnitt vor Caption-Generierung").
- Wenn das Thema gar keine Recherche braucht: {"skip":true,...} mit leeren Arrays.

Antworte AUSSCHLIESSLICH mit JSON:
{"skip":false,"bullets":["..."],"sources_hint":["youtube","tool-docs"],"open_questions":["..."]}`;

  const user = `Thema: ${input.topic || input.painPointTitle}
Pain Point: ${input.painPointTitle}
Genutzte Tools: ${input.tools.join(', ') || '(keine genannt)'}

Gesprächsausschnitt:
${renderChatSlice(input.history)}`;
  return { system, user };
}

export function parseResearchResult(raw: string): ResearchBrief {
  const parsed = safeParseJson<Record<string, unknown>>(raw);
  if (!parsed) {
    return { skip: true, bullets: [], sources_hint: [], open_questions: [] };
  }
  const bullets = asStringArray(parsed.bullets);
  return {
    skip: parsed.skip === true || bullets.length === 0,
    bullets,
    sources_hint: asStringArray(parsed.sources_hint),
    open_questions: asStringArray(parsed.open_questions),
  };
}

export async function runTopicResearch(
  complete: CompleteJson,
  input: ResearchInput,
): Promise<AgentResult<ResearchBrief>> {
  const { system, user } = buildResearchPrompt(input);
  try {
    const { content, tokens } = await complete({ system, user });
    return { ok: true, data: parseResearchResult(content), tokens };
  } catch (e) {
    return {
      ok: false,
      data: { skip: true, bullets: [], sources_hint: [], open_questions: [] },
      error: e instanceof Error ? e.message : String(e),
      tokens: estimateTokens(system + user),
    };
  }
}
