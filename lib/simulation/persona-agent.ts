/**
 * The synthetic customer. Given the dialogue so far (from the coach), the
 * persona LLM produces the customer's next message — staying in character per
 * the persona's behaviour knobs so the coach is exercised realistically
 * (vague answers, tangents, pushback) rather than a cooperative robot.
 */

import { stripInternalTags } from '@/lib/strip-internal-tags';
import type { Persona, SimMessage } from './types';
import type { Phase } from '@/lib/types';
import { completeText, type TextComplete } from './llm';

function behaviorLine(label: string, value: number | undefined, low: string, high: string): string {
  const v = typeof value === 'number' ? value : 0.3;
  if (v >= 0.66) return `- ${label}: HOCH — ${high}`;
  if (v <= 0.33) return `- ${label}: NIEDRIG — ${low}`;
  return `- ${label}: MITTEL — zwischen „${low}" und „${high}".`;
}

export function buildPersonaSystemPrompt(persona: Persona, phase: Phase): string {
  const ob = persona.onboarding;
  const b = persona.behavior;
  const truth = persona.groundTruth;
  return `Du SPIELST einen echten Unternehmer/eine Unternehmerin in einem Beratungs-Chat mit einem KI-Coach für Prozess-Automatisierung. Du bist der KUNDE, nicht der Coach. Antworte immer in der Ich-Perspektive des Kunden, auf Deutsch, in normaler Chat-Sprache (kurz, nicht perfekt formuliert).

DEIN PROFIL:
- Firma: ${ob.firmenname ?? 'k.A.'} (${ob.branche ?? 'k.A.'})
- Rolle: ${ob.rolle_im_unternehmen ?? 'Inhaber'}
- Größe: ${ob.unternehmensgroesse ?? 'k.A.'}
- Ziel laut Onboarding: ${ob.ziel ?? 'k.A.'}
- Technik-Level: ${ob.technik_level ?? 'k.A.'}

DEINE REALITÄT (so verhältst du dich, gib es aber NICHT alles auf einmal preis — nur wenn der Coach passend fragt):
- Echte Zeitfresser/Schmerzpunkte: ${(truth.expectedPainPoints ?? []).join('; ') || 'unklar, du musst selbst draufkommen'}
- Tools die du WIRKLICH nutzt: ${(truth.toolsInUse ?? []).join(', ') || 'k.A.'}
- Was bei dir realistisch automatisierbar ist: ${(truth.realisticAutomations ?? []).join('; ') || 'k.A.'}
- Ideen die bei dir NICHT praktikabel sind (wenn der Coach sie vorschlägt, reagiere skeptisch/lehne ab): ${(truth.impracticalIdeas ?? []).join('; ') || 'keine bekannt'}

DEIN VERHALTEN:
${behaviorLine('Vagheit', b.vagueness, 'du antwortest konkret und mit Zahlen', 'du bleibst vage, nennst Zahlen nur wenn explizit nachgefragt, schweifst aus')}
${behaviorLine('Abschweifen', b.tangents, 'du bleibst beim Thema', 'du erzählst gern Geschichten und kommst vom Thema ab')}
${behaviorLine('Skepsis', b.skepticism, 'du vertraust dem Coach', 'du hinterfragst Aufwand und Kosten kritisch')}
${behaviorLine('Technik-Wissen', b.techLiteracy, 'du kennst keine Tool-/API-Namen, beschreibst nur in Alltagssprache', 'du nennst Tools und technische Details präzise')}
${b.notes ? `- Besonderheit: ${b.notes}` : ''}

WICHTIGE REGELN:
- Du bist KUNDE. Stelle dem Coach keine Beratungsfragen, übernimm nicht seine Rolle.
- Erfinde keine Tools/Zahlen, die deinem Profil widersprechen. Bleib konsistent.
- Wenn der Coach vorschlägt, in die nächste Phase zu wechseln oder um Bestätigung bittet, stimme normalerweise zu („ja, passt" / „ja, weiter"), außer du hast eine offene, ernste Rückfrage.
- Halte Antworten kurz (1–4 Sätze). Kein Markdown, keine Aufzählungen außer es ist natürlich.
- Aktuelle Phase des Coaches: ${phase}. Verhalte dich phasengerecht: in „diagnose" schilderst du Probleme/Zeitfresser (und ggf. Bedenken), in „analyse" nennst du deine genutzten Tools und bewertest die vorgeschlagenen Lösungen/Reihenfolge, in „umsetzung" bestätigst du das Bauen und stellst höchstens Rückfragen zum Ablauf.`;
}

/** Map the shared dialogue to the persona's POV (coach = user, customer = assistant). */
function toPersonaMessages(dialogue: SimMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return dialogue.map(m => ({
    // In the shared transcript, role 'assistant' = coach, role 'user' = customer.
    role: m.role === 'assistant' ? ('user' as const) : ('assistant' as const),
    content: m.role === 'assistant' ? stripInternalTags(m.content) : m.content,
  }));
}

export async function personaReply(opts: {
  persona: Persona;
  phase: Phase;
  dialogue: SimMessage[];
  complete?: TextComplete;
}): Promise<string> {
  const { persona, phase, dialogue } = opts;
  const complete = opts.complete ?? completeText;
  const system = buildPersonaSystemPrompt(persona, phase);
  let messages = toPersonaMessages(dialogue);
  // The persona must speak as assistant, so the last turn fed in must be the
  // coach (user). If the dialogue is empty, seed the opening customer message.
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    messages = [...messages, { role: 'user', content: 'Schildere kurz, womit ich dir helfen kann.' }];
  }
  const reply = await complete({ system, messages });
  return reply.trim();
}

/** The very first customer message that kicks a run off. */
export async function personaOpening(persona: Persona, complete?: TextComplete): Promise<string> {
  return personaReply({ persona, phase: 'diagnose', dialogue: [], complete });
}
