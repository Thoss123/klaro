/**
 * Supervisor Agent (Sprint 3.3) — alignment gate before the Canvas Worker.
 *
 * Checks: (a) what the current chat slice is about, (b) exactly one pain point,
 * (c) update existing workflow vs. new, (d) no side topic sneaking in.
 *
 * Pure helpers (`buildSupervisorPrompt`, `parseSupervisorResult`) are unit-tested
 * without network; `runSupervisor` wires them to a `CompleteJson`.
 */

import type { CanvasData } from '@/lib/types';
import type { AgentMessage, AgentResult, SupervisorResult, SupervisorVerdict } from './types';
import { filterCanvasHistory } from '@/lib/hidden-chat';
import { asStringArray, type CompleteJson, estimateTokens, safeParseJson } from './llm';

export interface SupervisorInput {
  phase: string;
  history: AgentMessage[];
  canvas: Pick<CanvasData, 'pain_points' | 'workflows'>;
}

/** Last N turns rendered as plain "Rolle: text" lines. */
export function renderChatSlice(history: AgentMessage[], lastN = 8): string {
  return history
    .slice(-lastN)
    .map(m => `${m.role === 'user' ? 'Nutzer' : 'Coach'}: ${(m.content || '').trim()}`)
    .filter(line => line.length > 7)
    .join('\n');
}

export function buildSupervisorPrompt(input: SupervisorInput): { system: string; user: string } {
  const visibleHistory = filterCanvasHistory(input.history);
  const painList = (input.canvas.pain_points || [])
    .map(p => `- ${p.id}: ${p.title}`)
    .join('\n') || '(keine)';
  const wfList = (input.canvas.workflows || [])
    .map(w => `- ${w.id} (pain=${w.linked_pain_point}): ${w.title}`)
    .join('\n') || '(keine)';

  const system = `Du bist der Supervisor-Agent in einer KI-Beratungs-Pipeline (unsichtbar für den Nutzer).
Du prüfst, ob aus dem aktuellen Gesprächsausschnitt ein Canvas-Workflow-Update gemacht werden darf.

Regeln:
- Es darf nur um GENAU EIN Thema / EINEN Pain Point gehen.
- Wenn der Chat-Ausschnitt einen bestehenden Pain Point betrifft, der schon einen Workflow hat → merge_with_existing=true und target_pain_point = dessen id.
- Wenn der Ausschnitt kein klares Workflow-Thema hat (Smalltalk, allgemeine Frage, mehrere Themen gemischt) → verdict "revise_coach" oder "block".
- "approved": klares einzelnes Thema, das einem Pain Point zugeordnet werden kann.
- "revise_coach": Thema unklar oder Coach driftet — kein Canvas-Update.
- "block": Ausschnitt enthält gar kein Automatisierungs-Thema.

Vorhandene Pain Points:
${painList}

Vorhandene Workflows:
${wfList}

Antworte AUSSCHLIESSLICH mit JSON:
{"verdict":"approved|revise_coach|block","active_topic":"...","target_pain_point":"pp_x oder null","merge_with_existing":true|false,"instruction_for_worker":"konkrete Anweisung was extrahiert werden soll","coach_hint":"optionaler interner Hinweis"}`;

  const user = `Aktueller Gesprächsausschnitt:\n${renderChatSlice(visibleHistory)}`;
  return { system, user };
}

const VALID_VERDICTS: SupervisorVerdict[] = ['approved', 'revise_coach', 'block'];

export function parseSupervisorResult(raw: string): SupervisorResult {
  const parsed = safeParseJson<Record<string, unknown>>(raw);
  if (!parsed) {
    // Fail open but cautiously: allow extraction, no merge hint.
    return {
      verdict: 'approved',
      active_topic: '',
      target_pain_point: null,
      merge_with_existing: false,
      instruction_for_worker: '',
    };
  }
  const verdictRaw = String(parsed.verdict || '').toLowerCase() as SupervisorVerdict;
  const verdict = VALID_VERDICTS.includes(verdictRaw) ? verdictRaw : 'approved';
  const ppRaw = parsed.target_pain_point;
  const target_pain_point =
    typeof ppRaw === 'string' && ppRaw.trim() && ppRaw.trim().toLowerCase() !== 'null'
      ? ppRaw.trim()
      : null;
  return {
    verdict,
    active_topic: typeof parsed.active_topic === 'string' ? parsed.active_topic.trim() : '',
    target_pain_point,
    merge_with_existing: parsed.merge_with_existing === true,
    instruction_for_worker:
      typeof parsed.instruction_for_worker === 'string' ? parsed.instruction_for_worker.trim() : '',
    coach_hint:
      typeof parsed.coach_hint === 'string' && parsed.coach_hint.trim()
        ? parsed.coach_hint.trim()
        : undefined,
  };
}

export async function runSupervisor(
  complete: CompleteJson,
  input: SupervisorInput,
): Promise<AgentResult<SupervisorResult>> {
  const { system, user } = buildSupervisorPrompt(input);
  try {
    const { content, tokens } = await complete({ system, user });
    return { ok: true, data: parseSupervisorResult(content), tokens };
  } catch (e) {
    return {
      ok: false,
      // Fail open: don't let a supervisor outage freeze the canvas.
      data: {
        verdict: 'approved',
        active_topic: '',
        target_pain_point: null,
        merge_with_existing: false,
        instruction_for_worker: '',
      },
      error: e instanceof Error ? e.message : String(e),
      tokens: estimateTokens(system + user),
    };
  }
}

// Re-export for callers that only need the array helper alongside this module.
export { asStringArray };
