/**
 * Workflow QA Agent / Critic (Sprint 3.4).
 *
 * Checklist: chronological steps, maximum automation, human-in-the-loop only for
 * strategy / script approval / before publish, title 3–5 words, tools from
 * use_cases. May propose `fixed_steps` the Canvas Worker must adopt verbatim.
 *
 * Pure helpers are unit-tested; `runWorkflowQA` wires them to a `CompleteJson`.
 */

import type { Workflow, WorkflowStep } from '@/lib/types';
import type { AgentResult, ResearchBrief, WorkflowQAResult } from './types';
import { asStringArray, type CompleteJson, estimateTokens, safeParseJson } from './llm';

export interface WorkflowQAInput {
  topic: string;
  painPointTitle: string;
  tools: string[];
  /** The workflow the worker is about to (re)build, if one already exists. */
  currentWorkflow?: Workflow | null;
  research?: ResearchBrief | null;
}

const VALID_STEP_TYPES = ['trigger', 'action', 'ai', 'human', 'decision', 'output'] as const;

/** Local, deterministic checks so QA catches the obvious errors even if the LLM misses them. */
export function staticWorkflowChecks(wf: Workflow | null | undefined): string[] {
  const issues: string[] = [];
  if (!wf) return issues;
  const titleWords = (wf.title || '').trim().split(/\s+/).filter(Boolean);
  if (titleWords.length > 5) issues.push(`Titel zu lang (${titleWords.length} Wörter, max 5)`);
  if (titleWords.length === 0) issues.push('Titel fehlt');
  const steps = wf.steps || [];
  if (steps.length < 3) issues.push(`Nur ${steps.length} Schritte — Workflow zu dünn (min 3)`);
  if (steps.length > 12) issues.push(`${steps.length} Schritte — zu lang (max ~10)`);
  if (steps.length > 0 && steps[0].type && steps[0].type !== 'trigger') {
    issues.push('Erster Schritt sollte ein Trigger sein');
  }
  // "Suite/publish before content exists" anti-pattern.
  const labels = steps.map(s => (s.label || '').toLowerCase());
  const publishIdx = labels.findIndex(l => /publish|veröffentlich|suite|posten|hochladen/.test(l));
  const contentIdx = labels.findIndex(l => /aufnahme|dreh|schnitt|video|material|skript|script/.test(l));
  if (publishIdx >= 0 && contentIdx >= 0 && publishIdx < contentIdx) {
    issues.push('Veröffentlichen steht vor Aufnahme/Schnitt — Reihenfolge falsch');
  }
  return issues;
}

export function buildWorkflowQAPrompt(input: WorkflowQAInput): { system: string; user: string } {
  const system = `Du bist der Workflow-QA-Agent (Critic) in einer KI-Beratungs-Pipeline (unsichtbar für den Nutzer).
Prüfe den geplanten Workflow gegen diese Checkliste:
1. Schritte chronologisch sinnvoll (Trigger → Verarbeitung → Freigabe → Ausführung → Veröffentlichen).
2. Maximale Automatisierung — nicht nur ein Teilschritt automatisiert, Rest manuell.
3. Human-in-the-loop NUR bei: strategischer Wahl, Skript-Freigabe, Freigabe vor Veröffentlichung.
4. Titel 3–5 Wörter, Deutsch.
5. Tools nur aus den genannten use_cases-Tools.
6. VERBOTEN: Veröffentlichen/Suite, bevor Material/Video existiert.
7. **Eine Node = eine Aufgabe** — kein Schritt, der zwei Dinge tut (z.B. „transkribieren UND speichern"). Aufteilen.
8. **Selbst-lieferndes Tool** (Fireflies/Otter transkribiert selbst) = Quelle/Trigger, KEIN extra KI-„transkribieren"-Schritt.
9. **Freigabe durch Menschen** = ein \`human\`-Schritt (senden + warten) gefolgt von einem \`decision\`-Schritt (Ja/Nein), nicht nur ein einzelnes \`decision\`.
10. **Trigger** passend zur echten Quelle (neue Mail/Zeitplan/eingehendes Ereignis), nicht beliebig.

Wenn Probleme: status "fail" und liefere fixed_steps (korrigierte, vollständige Schrittliste).
Wenn alles passt: status "pass", fixed_steps weglassen.

Erlaubte step.type: trigger, action, ai, human, decision, output.

Antworte AUSSCHLIESSLICH mit JSON:
{"status":"pass|fail","issues":["..."],"fixed_steps":[{"id":"s1","label":"...","type":"trigger"}],"notes":"..."}`;

  const wfJson = input.currentWorkflow
    ? JSON.stringify({ title: input.currentWorkflow.title, steps: input.currentWorkflow.steps }, null, 2)
    : '(noch kein Workflow — bewerte das geplante Thema)';

  const researchBlock = input.research && !input.research.skip && input.research.bullets.length
    ? `\nRecherche-Hinweise:\n${input.research.bullets.map(b => `- ${b}`).join('\n')}`
    : '';

  const user = `Thema: ${input.topic || input.painPointTitle}
Pain Point: ${input.painPointTitle}
Verfügbare Tools: ${input.tools.join(', ') || '(keine)'}${researchBlock}

Geplanter Workflow:
${wfJson}`;
  return { system, user };
}

export function normalizeFixedSteps(raw: unknown): WorkflowStep[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const steps = raw
    .map((s, i): WorkflowStep | null => {
      if (!s || typeof s !== 'object') return null;
      const o = s as Record<string, unknown>;
      const label = typeof o.label === 'string' ? o.label.trim() : '';
      if (!label) return null;
      const typeRaw = String(o.type || '').toLowerCase();
      const type = (VALID_STEP_TYPES as readonly string[]).includes(typeRaw)
        ? (typeRaw as WorkflowStep['type'])
        : 'action';
      return {
        id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `s${i + 1}`,
        label,
        type,
      };
    })
    .filter((s): s is WorkflowStep => s !== null);
  return steps.length > 0 ? steps : undefined;
}

export function parseWorkflowQAResult(raw: string, staticIssues: string[] = []): WorkflowQAResult {
  const parsed = safeParseJson<Record<string, unknown>>(raw);
  if (!parsed) {
    return {
      status: staticIssues.length ? 'fail' : 'pass',
      issues: staticIssues,
      notes: 'QA-Antwort nicht parsebar — nur statische Checks angewandt.',
    };
  }
  const llmIssues = asStringArray(parsed.issues);
  const issues = [...new Set([...staticIssues, ...llmIssues])];
  const statusRaw = String(parsed.status || '').toLowerCase();
  const status: WorkflowQAResult['status'] =
    statusRaw === 'fail' || issues.length > 0 ? 'fail' : 'pass';
  return {
    status,
    issues,
    fixed_steps: normalizeFixedSteps(parsed.fixed_steps),
    notes: typeof parsed.notes === 'string' ? parsed.notes.trim() : '',
  };
}

export async function runWorkflowQA(
  complete: CompleteJson,
  input: WorkflowQAInput,
): Promise<AgentResult<WorkflowQAResult>> {
  const staticIssues = staticWorkflowChecks(input.currentWorkflow);
  const { system, user } = buildWorkflowQAPrompt(input);
  try {
    const { content, tokens } = await complete({ system, user });
    return { ok: true, data: parseWorkflowQAResult(content, staticIssues), tokens };
  } catch (e) {
    return {
      ok: false,
      data: {
        status: staticIssues.length ? 'fail' : 'pass',
        issues: staticIssues,
        notes: 'QA-Aufruf fehlgeschlagen — nur statische Checks.',
      },
      error: e instanceof Error ? e.message : String(e),
      tokens: estimateTokens(system + user),
    };
  }
}
