/**
 * Interne Gesprächsstrategie des Coaches (projektweit, nie nutzer-sichtbar).
 *
 * Vor dem ersten Chat aus Firmen-Recherche + Onboarding + Branchen-Wissen
 * generiert; bei Phasenwechseln und relevanten Canvas-Änderungen fortgeschrieben.
 * Gespeichert in `projects.strategy`, injiziert als {{strategie}} in den
 * System-Prompt (coach/prompts/base.md).
 *
 * Fail-open wie company-research: jeder Fehler → null, nichts blockiert.
 */
import { Mistral } from '@mistralai/mistralai';
import { withRateLimitRetry } from '@/lib/agents/llm';
import { searchKnowledge } from '@/lib/rag';
import type { CanvasData, OnboardingData } from '@/lib/types';

const STRATEGY_MODEL = 'mistral-small-latest';

/** Feste Gliederung — Generierung UND Updates halten diese Sektionen bei. */
export const STRATEGY_SECTIONS = [
  '## Firmenbild',
  '## Branchen-Kontext',
  '## Hypothesen (wahrscheinliche Zeitfresser)',
  '## Mögliche Lösungsrichtungen',
  '## Erwartete Einwände',
  '## Gesprächsstrategie',
  '## Offene Fragen',
] as const;

async function completeText(prompt: string): Promise<string | null> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return null;
  const client = new Mistral({ apiKey });
  const response = await withRateLimitRetry(() =>
    client.chat.complete({
      model: STRATEGY_MODEL,
      messages: [{ role: 'user', content: prompt }],
    }),
  );
  const raw = response.choices?.[0]?.message?.content;
  const text = typeof raw === 'string'
    ? raw
    : Array.isArray(raw)
      ? raw.map(c => (c.type === 'text' ? c.text : '')).join('')
      : '';
  // Modelle wickeln Markdown gern in ```-Fences — fürs Prompt-Injizieren entfernen.
  const cleaned = text
    .trim()
    .replace(/^```(?:markdown|md)?\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim();
  return cleaned || null;
}

/** Branchen-/Use-Case-Wissen als kompakter Kontextblock (fail-open: ''). */
async function loadSectorKnowledge(branche?: string): Promise<string> {
  const b = (branche || '').trim();
  if (!b) return '';
  try {
    const hits = await searchKnowledge({
      query: `${b} typische Prozesse Pain Points Automatisierung Use Cases`,
      types: ['branche', 'use_case'],
      matchCount: 4,
      threshold: 0.3,
    });
    if (!hits.length) return '';
    return hits
      .map(h => `### ${h.title}\n${(h.content || '').slice(0, 2200)}`)
      .join('\n\n');
  } catch (e: unknown) {
    console.warn('[strategy] sector knowledge failed (fail-open):', e instanceof Error ? e.message : String(e));
    return '';
  }
}

function formatOnboarding(ob: Partial<OnboardingData>): string {
  const rows: Array<[string, string | undefined]> = [
    ['Firma', ob.firmenname],
    ['Website', ob.firmen_website],
    ['Branche', ob.branche],
    ['Rolle', ob.rolle_im_unternehmen],
    ['Teamgröße', ob.unternehmensgroesse],
    ['Ziel', ob.ziel],
    ['KI-Erfahrung', ob.ki_erfahrung],
    ['Technik-Level', ob.technik_level],
    ['Wer setzt um', ob.wer_setzt_um],
    ['Bisheriges Hindernis', ob.hindernis],
    ['Tempo-Wunsch', ob.tempo],
  ];
  return rows
    .filter(([, v]) => !!v?.trim())
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
}

const STRATEGY_RULES = `Regeln für das Strategie-Dokument:
- Deutsch, kompakt (max. ~450 Wörter), Markdown mit GENAU diesen Sektionen in dieser Reihenfolge:
${STRATEGY_SECTIONS.join('\n')}
- Hypothesen sind VERMUTUNGEN (aus Branche + Onboarding abgeleitet), klar als solche formuliert — der Coach prüft sie im Gespräch, behauptet sie nie als Fakten.
- "Mögliche Lösungsrichtungen": 3–6 konkrete Automatisierungs-Kandidaten, bevorzugt aus dem Branchen-Wissen (mit Bereichs-Zuordnung wie Vermarktung/Kommunikation/Backoffice — daraus baut der Coach später Ideen-Karten).
- "Erwartete Einwände": aus Hindernis/KI-Erfahrung/Ziel ableiten (z.B. Kontrollverlust, Datenschutz, "zu technisch", Kosten) + je 1 Satz, wie der Coach kontern soll.
- "Gesprächsstrategie": Einstiegs-Einschätzung (weiß was er will / orientierungslos / skeptisch), womit das Gespräch ansetzen soll, was zuerst validiert werden muss.
- Nichts erfinden: Wo Information fehlt, gehört der Punkt in "Offene Fragen".`;

export async function generateInitialStrategy(input: {
  onboarding: Partial<OnboardingData>;
  recherche?: string | null;
}): Promise<string | null> {
  try {
    const sector = await loadSectorKnowledge(input.onboarding.branche);
    const prompt = `Du bist der interne Stratege des KI-Coaches Axantilo. Erstelle VOR dem ersten Gespräch ein internes Strategie-Dokument über diesen Neukunden. Der Kunde sieht es nie — es steuert, wie der Coach das Gespräch führt.

Onboarding-Angaben:
${formatOnboarding(input.onboarding)}

Automatische Firmen-Recherche (ungeprüft):
${input.recherche?.trim() || 'Keine Recherche-Ergebnisse.'}

Branchen-Wissen aus der Datenbank:
${sector || 'Kein Branchen-Wissen vorhanden.'}

${STRATEGY_RULES}

Gib NUR das Markdown-Dokument zurück.`;
    return await completeText(prompt);
  } catch (e: unknown) {
    console.error('[strategy] generate failed (fail-open):', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Kompakter Canvas-Auszug für Strategie-Updates (nur strategierelevante Felder). */
function summarizeCanvasForStrategy(canvas: Partial<CanvasData> | null | undefined): string {
  if (!canvas) return 'Kein Canvas.';
  const pains = (canvas.pain_points || [])
    .map(p => `- ${p.title}${p.rank != null ? ` (rank ${p.rank})` : ''}: ${p.description || ''} ${p.frequency || ''} ${p.effort || ''}`.trim())
    .join('\n');
  const ideas = (canvas.idea_cards || [])
    .map(c => `- [${c.status || 'proposed'}] ${c.area}: ${c.title}`)
    .join('\n');
  const workflows = [...(canvas.workflows || []), ...(canvas.workflow_plans || [])]
    .map(w => `- ${w.title} (→ ${w.linked_pain_point})`)
    .join('\n');
  const tools = (canvas.use_cases || [])
    .map(u => `- ${u.title}: ${(u.tools || []).join(', ') || '—'}`)
    .join('\n');
  return [
    pains && `Potenzielle Verbesserungen:\n${pains}`,
    ideas && `Ideen-Karten:\n${ideas}`,
    tools && `Ist-Tools:\n${tools}`,
    workflows && `Workflow-Pläne:\n${workflows}`,
  ].filter(Boolean).join('\n\n') || 'Canvas noch leer.';
}

export async function updateStrategy(input: {
  current: string;
  trigger: 'phase_transition' | 'canvas_delta';
  phase?: string;
  phaseSummary?: string;
  canvas?: Partial<CanvasData> | null;
}): Promise<string | null> {
  try {
    const prompt = `Du bist der interne Stratege des KI-Coaches Axantilo. Aktualisiere das interne Strategie-Dokument mit den neuen Erkenntnissen. Der Kunde sieht es nie.

Bestehendes Strategie-Dokument:
${input.current}

Anlass: ${input.trigger === 'phase_transition' ? `Phasenwechsel (abgeschlossene Phase: ${input.phase || 'unbekannt'})` : 'Neue Informationen auf dem Canvas'}

${input.phaseSummary ? `Phasen-Zusammenfassung:\n${input.phaseSummary}\n` : ''}
Aktueller Canvas-Stand:
${summarizeCanvasForStrategy(input.canvas)}

Aufgaben:
- Bestätigte Hypothesen als bestätigt markieren („✓ bestätigt: …"), widerlegte streichen oder als widerlegt markieren.
- Firmenbild/Lösungsrichtungen mit neuen Fakten anreichern; Erledigtes aus "Offene Fragen" entfernen.
- "Gesprächsstrategie" auf die JETZT anstehende Arbeit ausrichten (was als Nächstes zu klären/zu tun ist).
- Struktur und Kompaktheit beibehalten (gleiche Sektionen, max. ~450 Wörter).
- Nichts erfinden. Wenn es nichts Relevantes gibt, gib das Dokument unverändert zurück.

${STRATEGY_RULES}

Gib NUR das Markdown-Dokument zurück.`;
    return await completeText(prompt);
  } catch (e: unknown) {
    console.error('[strategy] update failed (fail-open):', e instanceof Error ? e.message : String(e));
    return null;
  }
}
