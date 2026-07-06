/**
 * Diagnose/Analyse: erkennt fehlende Coach-<canvas_update>-Tags und generiert
 * den JSON-Payload per Mistral Small (Fallback wenn der Coach nur behauptet,
 * das Canvas zu schreiben, aber keinen Tag sendet).
 */
import { Mistral } from '@mistralai/mistralai';
import { mistralCompleteJson, safeParseJson, withRateLimitRetry } from '@/lib/agents/llm';
import { stripInternalTags } from '@/lib/strip-internal-tags';
import type { CanvasData, OnboardingData } from '@/lib/types';

export type CoachCanvasPayload = {
  company?: Record<string, unknown>;
  pain_points?: Array<Record<string, unknown>>;
  idea_cards?: Array<Record<string, unknown>>;
  tool_evaluations?: Array<Record<string, unknown>>;
  solution_structures?: Array<Record<string, unknown>>;
};

/** Sichtbarer Text behauptet ein Canvas-Update ohne Tag. */
export function claimsCanvasUpdateWithoutTag(rawAssistant: string): boolean {
  const stripped = stripInternalTags(rawAssistant);
  if (/<canvas_update[\s>]/i.test(rawAssistant)) return false;
  return /(?:ich halte(?:\s+das)?(?:\s+kurz)?\s+fest|ich zeichne|rechts siehst|am canvas|auf dem canvas|canvas ergänzt|canvas aktualisiert|hab(?:e)?\s+(?:dir|ihr)\s+drei|möglichkeiten\s+auf dem canvas)/i.test(
    stripped,
  );
}

export function userRequestedCanvasBuild(userMessage: string): boolean {
  return /(?:bau(?:en)?\s+(?:das\s+)?am\s+canvas|canvas\s+bau|sehe\s+(?:noch\s+)?nicht|sehs?\s+noch\s+nicht|nichts\s+rechts)/i.test(
    userMessage || '',
  );
}

export function shouldRecoverCoachCanvas(params: {
  phase: string;
  rawAssistant: string;
  userMessage: string;
  canvasApplied: boolean;
}): boolean {
  if (params.canvasApplied) return false;
  const phase = params.phase === 'plan' ? 'analyse' : params.phase;
  if (phase !== 'diagnose' && phase !== 'analyse') return false;

  if (claimsCanvasUpdateWithoutTag(params.rawAssistant)) return true;
  if (userRequestedCanvasBuild(params.userMessage)) return true;

  if (phase === 'diagnose') {
    const userHasFacts =
      /\d+\s*[-–]?\s*\d*\s*(?:h|stunden|min|pro monat|expos)/i.test(params.userMessage) ||
      /expos|word|photoshop|dokument/i.test(params.userMessage);
    const coachAcknowledged =
      /(?:zeitfresser|stunden|expos|pro monat|halte|zeichne|canvas|knopfdruck)/i.test(
        stripInternalTags(params.rawAssistant),
      );
    if (userHasFacts && coachAcknowledged) return true;
  }

  return false;
}

/** Während des Streams: Chat-Text vor dem (partiellen) canvas_update-Tag anzeigen. */
export function stripStreamingCanvasTail(content: string): string {
  if (!content) return '';
  const idx = content.search(/<canvas_update[\s>]/i);
  if (idx >= 0) return content.slice(0, idx).trimEnd();
  return content.replace(/<canvas_update[\s\S]*$/i, '').trimEnd();
}

const EXTRACT_SYSTEM = `Du extrahierst strukturierte Canvas-Daten für Axantilo Phase Diagnose.
Antworte NUR mit gültigem JSON (kein Markdown, kein Fließtext).

Erlaubte Top-Level-Keys: company, pain_points, idea_cards
- company: { offer, target_customers, acquisition, process_steps[] } — nur belegte Strings
- pain_points: [{ id, title, description, frequency, effort, priority }] — nur wenn Zahlen/Ablauf im Chat
- idea_cards: GENAU EINE Karte wenn eine Lösungsrichtung klar ist (z.B. "Exposés auf Knopfdruck")
  — integrierter Ablauf, KEINE getrennten Varianten "nur Texte" / "nur Bilder"
  Format: { id, area, title, description, flow, status: "proposed"|"interested" }

Regeln:
- Kumulativ: bestehendes Canvas beibehalten und ergänzen (ids stabil: pp_1, idea_1, …)
- Nichts erfinden — nur Fakten aus dem Gespräch
- frequency/effort mit exakten Nutzer-Zahlen ("5–6 pro Monat", "2–3 h pro Stück")
- Wenn Nutzer "auf Knopfdruck" / fertiges Dokument will: idea_card status "interested"`;

export async function generateCoachCanvasPayload(input: {
  phase: string;
  history: Array<{ role: string; content: string }>;
  currentCanvas: CanvasData;
  onboarding?: Partial<OnboardingData> | null;
  lastUserMessage: string;
  lastAssistantMessage: string;
}): Promise<CoachCanvasPayload | null> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return null;

  const client = new Mistral({ apiKey });
  const complete = mistralCompleteJson(client);

  const chatContext = input.history
    .slice(-12)
    .map(m => `${m.role === 'user' ? 'Nutzer' : 'Coach'}: ${stripInternalTags(m.content)}`)
    .join('\n\n');

  const userPrompt = [
    `Phase: ${input.phase}`,
    input.onboarding?.branche ? `Branche: ${input.onboarding.branche}` : '',
    input.onboarding?.firmenname ? `Firma: ${input.onboarding.firmenname}` : '',
    '',
    'Aktuelles Canvas (JSON):',
    JSON.stringify(
      {
        company: input.currentCanvas.company ?? undefined,
        pain_points: input.currentCanvas.pain_points ?? [],
        idea_cards: input.currentCanvas.idea_cards ?? [],
      },
      null,
      2,
    ),
    '',
    'Gespräch:',
    chatContext,
    '',
    `Letzte Nutzer-Nachricht: ${input.lastUserMessage}`,
    `Letzte Coach-Nachricht: ${stripInternalTags(input.lastAssistantMessage)}`,
    '',
    'Extrahiere den vollständigen Canvas-Stand als JSON.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const { content } = await withRateLimitRetry(() =>
      complete({ system: EXTRACT_SYSTEM, user: userPrompt }),
    );
    const parsed = safeParseJson<CoachCanvasPayload>(content);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (e: unknown) {
    console.warn('[coach-canvas-sync] generate failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}
