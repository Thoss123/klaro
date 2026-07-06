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
import Anthropic from '@anthropic-ai/sdk';
import { withRateLimitRetry } from '@/lib/agents/llm';
import { searchKnowledge } from '@/lib/rag';
import { researchCompany } from '@/lib/company-research';
import {
  applyPrepStep,
  createInitialPrepProgress,
  type StrategyPrepProgress,
} from '@/lib/strategy-prep';
import type { CanvasData, OnboardingData } from '@/lib/types';
import type { TokenUsage } from '@/lib/billing/token-cost';

const STRATEGY_MODEL = process.env.ANTHROPIC_STRATEGY_MODEL || 'claude-sonnet-5';

function addStrategyUsage(total: TokenUsage, next: TokenUsage | undefined | null) {
  if (!next) return;
  total.inputTokens = (total.inputTokens ?? 0) + (next.inputTokens ?? next.input_tokens ?? 0);
  total.outputTokens = (total.outputTokens ?? 0) + (next.outputTokens ?? next.output_tokens ?? 0);
  total.cacheCreationInputTokens =
    (total.cacheCreationInputTokens ?? 0) + (next.cacheCreationInputTokens ?? next.cache_creation_input_tokens ?? 0);
  total.cacheReadInputTokens =
    (total.cacheReadInputTokens ?? 0) + (next.cacheReadInputTokens ?? next.cache_read_input_tokens ?? 0);
}

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

const STRATEGY_PART1_SECTIONS = STRATEGY_SECTIONS.slice(0, 4);
const STRATEGY_PART2_SECTIONS = STRATEGY_SECTIONS.slice(4);

export type StrategyProgressSink = (progress: StrategyPrepProgress) => void | Promise<void>;

async function completeTextWithUsage(prompt: string): Promise<{ text: string | null; usage: TokenUsage; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { text: null, usage: {}, model: STRATEGY_MODEL };
  const client = new Anthropic({ apiKey });
  const response = await withRateLimitRetry(() =>
    client.messages.create({
      model: STRATEGY_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  );
  const text = response.content
    .map(block => (block.type === 'text' ? block.text : ''))
    .join('');
  // Modelle wickeln Markdown gern in ```-Fences — fürs Prompt-Injizieren entfernen.
  const cleaned = text
    .trim()
    .replace(/^```(?:markdown|md)?\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim();
  return { text: cleaned || null, usage: response.usage as TokenUsage, model: STRATEGY_MODEL };
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

const STRATEGY_PART1_RULES = `Regeln für Teil 1 des Strategie-Dokuments:
- Deutsch, kompakt, Markdown mit GENAU diesen Sektionen in dieser Reihenfolge:
${STRATEGY_PART1_SECTIONS.join('\n')}
- Hypothesen sind VERMUTUNGEN, klar als solche formuliert.
- "Mögliche Lösungsrichtungen": 3–6 konkrete Automatisierungs-Kandidaten mit Bereichs-Zuordnung.
- Nichts erfinden: Unbekanntes weglassen oder in spätere Sektionen offen lassen.`;

const STRATEGY_PART2_RULES = `Regeln für Teil 2 (setzt auf Teil 1 auf):
- Markdown mit GENAU diesen Sektionen in dieser Reihenfolge:
${STRATEGY_PART2_SECTIONS.join('\n')}
- "Erwartete Einwände": aus Hindernis/KI-Erfahrung/Ziel ableiten + je 1 Satz Konter.
- "Gesprächsstrategie": Einstiegs-Einschätzung, womit ansetzen, was zuerst validieren.
- "Offene Fragen": nur echte Lücken aus Onboarding/Recherche.`;

async function setStep(
  progress: StrategyPrepProgress,
  stepIndex: number,
  status: 'running' | 'done' | 'skipped',
  sink: StrategyProgressSink,
  message?: string,
  detail?: string,
): Promise<StrategyPrepProgress> {
  const next = applyPrepStep(progress, stepIndex, status, message, detail);
  await sink(next);
  return next;
}

/** Pipeline mit 5 echten Zwischenständen (je ein Balken in der Prep-UI). */
export async function runInitialStrategyPipeline(input: {
  onboarding: Partial<OnboardingData>;
  existingRecherche?: string | null;
  onProgress: StrategyProgressSink;
}): Promise<{ strategy: string | null; recherche: string | null; usage: TokenUsage; model: string }> {
  let progress = createInitialPrepProgress();
  const usage: TokenUsage = {};
  await input.onProgress(progress);

  let recherche = input.existingRecherche?.trim() || null;

  progress = await setStep(progress, 0, 'running', input.onProgress);
  progress = await setStep(progress, 0, 'done', input.onProgress);

  progress = await setStep(progress, 1, 'running', input.onProgress);
  if (!recherche && input.onboarding.firmenname?.trim()) {
    recherche = await researchCompany(
      input.onboarding.firmenname,
      input.onboarding.branche,
      input.onboarding.firmen_website || undefined,
    );
  }
  progress = await setStep(
    progress,
    1,
    'done',
    input.onProgress,
    recherche ? undefined : 'Keine öffentlichen Firmendaten gefunden — wir starten mit deinen Angaben.',
  );

  progress = await setStep(progress, 2, 'running', input.onProgress);
  const sector = await loadSectorKnowledge(input.onboarding.branche);
  progress = await setStep(progress, 2, 'done', input.onProgress);

  progress = await setStep(progress, 3, 'running', input.onProgress);
  const onboardingBlock = formatOnboarding(input.onboarding);
  const part1Prompt = `Du bist der interne Stratege des KI-Coaches Axantilo. Erstelle TEIL 1 eines internen Strategie-Dokuments. Der Kunde sieht es nie.

Onboarding-Angaben:
${onboardingBlock}

Automatische Firmen-Recherche (ungeprüft):
${recherche?.trim() || 'Keine Recherche-Ergebnisse.'}

Branchen-Wissen aus der Datenbank:
${sector || 'Kein Branchen-Wissen vorhanden.'}

${STRATEGY_PART1_RULES}

Gib NUR Teil 1 zurück (die vier Sektionen).`;
  const part1Result = await completeTextWithUsage(part1Prompt);
  addStrategyUsage(usage, part1Result.usage);
  const part1 = part1Result.text;
  if (!part1?.trim()) {
    progress = { ...progress, error: 'Teil 1 fehlgeschlagen', updatedAt: new Date().toISOString() };
    await input.onProgress(progress);
    return { strategy: null, recherche, usage, model: STRATEGY_MODEL };
  }
  progress = await setStep(progress, 3, 'done', input.onProgress);

  progress = await setStep(progress, 4, 'running', input.onProgress);
  const part2Prompt = `Du bist der interne Stratege des KI-Coaches Axantilo. Vervollständige das Strategie-Dokument mit TEIL 2. Der Kunde sieht es nie.

Onboarding-Angaben:
${onboardingBlock}

Bereits erstellter Teil 1:
${part1.trim()}

${STRATEGY_PART2_RULES}

Gib NUR Teil 2 zurück (die drei Sektionen).`;
  const part2Result = await completeTextWithUsage(part2Prompt);
  addStrategyUsage(usage, part2Result.usage);
  const part2 = part2Result.text;
  if (!part2?.trim()) {
    progress = { ...progress, error: 'Teil 2 fehlgeschlagen', updatedAt: new Date().toISOString() };
    await input.onProgress(progress);
    return { strategy: null, recherche, usage, model: STRATEGY_MODEL };
  }

  const strategy = `${part1.trim()}\n\n${part2.trim()}`;
  progress = await setStep(progress, 4, 'done', input.onProgress);
  progress = { ...progress, done: true, updatedAt: new Date().toISOString() };
  await input.onProgress(progress);
  return { strategy, recherche, usage, model: STRATEGY_MODEL };
}

export async function generateInitialStrategy(input: {
  onboarding: Partial<OnboardingData>;
  recherche?: string | null;
}): Promise<string | null> {
  try {
    const { strategy } = await runInitialStrategyPipeline({
      onboarding: input.onboarding,
      existingRecherche: input.recherche,
      onProgress: () => {},
    });
    return strategy;
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
}): Promise<{ strategy: string | null; usage: TokenUsage; model: string }> {
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
    const result = await completeTextWithUsage(prompt);
    return { strategy: result.text, usage: result.usage, model: result.model };
  } catch (e: unknown) {
    console.error('[strategy] update failed (fail-open):', e instanceof Error ? e.message : String(e));
    return { strategy: null, usage: {}, model: STRATEGY_MODEL };
  }
}
