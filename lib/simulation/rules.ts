/**
 * The judging rule catalog.
 *
 * Two kinds:
 *  - MECHANICAL rules run deterministically over the transcript + final canvas
 *    (they reuse the real workflow validator, so "is this practical?" is checked
 *    by the same code production uses — the judge model can't soften it).
 *  - RUBRIC rules are definitions handed to the judge LLM; it returns a
 *    pass/fail + offending quote per rule. They encode the coaching guidance
 *    from the team's feedback memories (cost framing, chat hygiene, …).
 */

import type { CanvasData, Phase } from '@/lib/types';
import { validateWorkflowStructure } from '@/lib/n8n-workflow-validate';
import type {
  Finding,
  FindingSeverity,
  Persona,
  TranscriptTurn,
} from './types';

export interface JudgeContext {
  persona: Persona;
  transcript: TranscriptTurn[];
  canvas: CanvasData;
  phasesRun: Phase[];
  /**
   * Phases that hit the turn cap without the coach declaring them complete.
   * Canvas-dependent checks (coverage, tools, workflows) are skipped for these,
   * because the coach writes the canvas at the END of a phase — a truncated
   * phase has an empty canvas through no fault of the coach.
   */
  stalledPhases?: Phase[];
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Significant words of a phrase, lowercased, stop-words and short tokens dropped. */
function keywords(phrase: string): string[] {
  const stop = new Set([
    'und', 'oder', 'die', 'der', 'das', 'ein', 'eine', 'für', 'mit', 'von',
    'the', 'and', 'for', 'with', 'per', 'pro', 'im', 'in', 'am', 'an',
  ]);
  return (phrase || '')
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !stop.has(w));
}

/** Loose containment: does `haystack` mention most of `needle`'s keywords? */
/** Substring-Match, der auch nahe Wortformen fasst (beantworten↔beantwortet). */
function fuzzyIncludes(hay: string, kw: string): boolean {
  if (hay.includes(kw)) return true;
  // Deutsche Beugung: gemeinsamer Wortstamm (die ersten ~⅘ des Stichworts).
  if (kw.length >= 6) {
    const stem = kw.slice(0, Math.ceil(kw.length * 0.8));
    return hay.includes(stem);
  }
  return false;
}

function looselyCovers(haystack: string, needle: string): boolean {
  const kws = keywords(needle);
  if (!kws.length) return false;
  const hay = (haystack || '').toLowerCase();
  const hits = kws.filter(k => fuzzyIncludes(hay, k)).length;
  if (hits / kws.length >= 0.5) return true;
  // Fallback: das distinktivste (längste) Fach-Stichwort reicht als Beleg —
  // ausführliche Ground-Truth-Sätze teilen mit knappen Canvas-Titeln oft nur
  // das Kernsubstantiv (z.B. „portalanfragen", „exposé", „vermarktung").
  const distinctive = [...kws].sort((a, b) => b.length - a.length)[0];
  return distinctive.length >= 7 && fuzzyIncludes(hay, distinctive);
}

// ── mechanical rules ─────────────────────────────────────────────────────────

export interface MechanicalRule {
  id: string;
  severity: FindingSeverity;
  targetPrompt: string;
  run(ctx: JudgeContext): Finding[];
}

/** Internal IDs / control tokens must never reach the user-visible text. */
const noInternalIds: MechanicalRule = {
  id: 'no-internal-ids',
  severity: 'high',
  targetPrompt: 'shared',
  run({ transcript }) {
    const patterns: Array<[RegExp, string]> = [
      [/\bpp_\d+/g, 'pain-point id (pp_…)'],
      [/\buc_\d+/g, 'use-case id (uc_…)'],
      [/\bwf_\d+/g, 'workflow id (wf_…)'],
      [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'UUID'],
      [/\b(session_id|project_id|workflow_id)\b/gi, 'internal field name'],
    ];
    const findings: Finding[] = [];
    for (const turn of transcript) {
      if (turn.role !== 'coach') continue;
      for (const [re, label] of patterns) {
        const m = turn.content.match(re);
        if (m) {
          findings.push({
            ruleId: 'no-internal-ids',
            kind: 'mechanical',
            phase: turn.phase,
            passed: false,
            severity: 'high',
            message: `Coach leaked ${label} into a user-visible message.`,
            evidence: m.slice(0, 3).join(', '),
            suggestedFix:
              'Reinforce in AXANTILO_SHARED_RULES that internal IDs/field names must never appear in chat text.',
          });
        }
      }
    }
    if (!findings.length) {
      return [pass('no-internal-ids', 'mechanical', 'high', 'No internal IDs leaked to the user.')];
    }
    return findings;
  },
};

/** Every pain point the persona is supposed to reveal should land in the canvas. */
const painPointCoverage: MechanicalRule = {
  id: 'painpoint-coverage',
  // Semantische Abdeckung ist fuzzy (Wortformen/Synonyme) — als weicher Hinweis
  // geführt, nicht als harter Blocker. Das echte „hat der Coach die Pains
  // erfasst?" beurteilt der Judge (Claude) aus dem Transkript.
  severity: 'medium',
  targetPrompt: 'diagnose',
  run({ persona, canvas, phasesRun, stalledPhases }) {
    if (!phasesRun.includes('diagnose')) return [];
    if (stalledPhases?.includes('diagnose')) {
      return [pass('painpoint-coverage', 'mechanical', 'medium',
        'Skipped — diagnose hit the turn cap before the coach writes the canvas.')];
    }
    const expected = persona.groundTruth.expectedPainPoints ?? [];
    if (!expected.length) return [];
    // Ein Bereich gilt als „erfasst", wenn er als potenzielle Verbesserung ODER
    // als Ideen-Karte auf dem Canvas steht — der Coach hält in Phase 1 die
    // größten Zeitfresser als pain_points und weitere Felder als idea_cards fest.
    const canvasText = [
      ...(canvas.pain_points ?? []).map(p => `${p.title} ${p.description}`),
      ...(canvas.idea_cards ?? []).map(c => `${c.title} ${c.description ?? ''} ${c.flow ?? ''}`),
    ].join('\n');
    const missing = expected.filter(e => !looselyCovers(canvasText, e));
    const covered = expected.length - missing.length;
    // Nur scheitern, wenn die MEHRHEIT fehlt. Ein guter Coach — besonders bei
    // Personas, die mit konkreten Ideen kommen (Pfad B) — fokussiert auf die
    // genannten Punkte und muss nicht jeden denkbaren Ground-Truth-Pain
    // aufdecken. Fehlt nur eine Minderheit, ist das ok (Hinweis, kein Fail).
    if (missing.length === 0) {
      return [pass('painpoint-coverage', 'mechanical', 'medium',
        `All ${expected.length} expected pain points reached the canvas.`)];
    }
    if (covered > missing.length) {
      return [pass('painpoint-coverage', 'mechanical', 'medium',
        `${covered}/${expected.length} expected pain points captured (Rest bewusst nicht vertieft): ${missing.join('; ')}`)];
    }
    return [{
      ruleId: 'painpoint-coverage',
      kind: 'mechanical',
      phase: 'diagnose',
      passed: false,
      severity: 'medium',
      message: `Nur ${covered}/${expected.length} erwartete Zeitfresser landeten auf dem Canvas.`,
      evidence: missing.join('; '),
      suggestedFix:
        'Phase-1 prompt should probe broader / not close diagnose before these recurring time-sinks surface.',
    }];
  },
};

/** Phase 2 must capture the customer's existing tools per pain point. */
const toolsCaptured: MechanicalRule = {
  id: 'tools-captured',
  severity: 'medium',
  targetPrompt: 'analyse',
  run({ persona, canvas, phasesRun, stalledPhases }) {
    if (!phasesRun.includes('analyse')) return [];
    if (stalledPhases?.includes('analyse')) {
      return [pass('tools-captured', 'mechanical', 'medium',
        'Skipped — analyse hit the turn cap before the canvas is finalized.')];
    }
    const expectedTools = persona.groundTruth.toolsInUse ?? [];
    if (!expectedTools.length) return [];
    const captured = (canvas.use_cases ?? []).flatMap(u => u.tools ?? []);
    if (!captured.length) {
      return [{
        ruleId: 'tools-captured',
        kind: 'mechanical',
        phase: 'analyse',
        passed: false,
        severity: 'medium',
        message: 'Phase 2 ended without capturing any of the customer\'s existing tools.',
        evidence: `expected to hear about: ${expectedTools.join(', ')}`,
        suggestedFix:
          'Phase-2 prompt must ask the Ist-Tools strictly per pain point before allowing phase_complete.',
      }];
    }
    return [pass('tools-captured', 'mechanical', 'medium',
      `Captured ${captured.length} tool(s) in the canvas.`)];
  },
};

/** Every workflow the coach designed must pass the real structural validator. */
const workflowStructureValid: MechanicalRule = {
  id: 'workflow-structure-valid',
  severity: 'critical',
  targetPrompt: 'analyse',
  run({ canvas, phasesRun, stalledPhases }) {
    if (!phasesRun.includes('analyse')) return [];
    if (stalledPhases?.includes('analyse')) {
      return [pass('workflow-structure-valid', 'mechanical', 'critical',
        'Skipped — analyse hit the turn cap before a workflow_plan would be produced.')];
    }
    const flows = [...(canvas.workflows ?? []), ...(canvas.workflow_plans ?? [])];
    if (!flows.length) {
      return [{
        ruleId: 'workflow-structure-valid',
        kind: 'mechanical',
        phase: 'analyse',
        passed: false,
        severity: 'high',
        message: 'Phase 2 (Analyse & Plan) finished but produced no workflow plan.',
        suggestedFix: 'The merged analyse prompt should not allow phase_complete without at least one workflow_plan.',
      }];
    }
    // Build-Zeit-Checks: n8n-Node-Typen und Konfiguration entstehen erst beim
    // Bauen (Umsetzung). Ein Phase-2-PLAN (workflow_plans, Schritte ohne n8nType)
    // wird daher nur STRUKTURELL geprüft (Trigger zuerst, kein Trigger mittendrin,
    // Kanten, Schrittzahl) — diese Codes werden für Pläne herausgefiltert.
    const BUILD_ONLY_CODES = new Set(['missing_n8n_type', 'incomplete_config', 'missing_ai_slot']);
    const planIds = new Set((canvas.workflow_plans ?? []).map(w => w.id));

    const findings: Finding[] = [];
    for (const wf of flows) {
      // step configs are keyed per-workflow then per-step; pass this workflow's
      // slice (empty for simulated plans) to the flat validator.
      const res = validateWorkflowStructure(wf, canvas.workflow_step_configs?.[wf.id] ?? {});
      const isPlan = planIds.has(wf.id) || (wf.steps ?? []).every(s => !s.n8nType);
      const errors = isPlan ? res.errors.filter(e => !BUILD_ONLY_CODES.has(e.code)) : res.errors;
      if (errors.length) {
        findings.push({
          ruleId: 'workflow-structure-valid',
          kind: 'mechanical',
          phase: 'analyse',
          passed: false,
          severity: 'critical',
          message: `Workflow "${wf.title}" is structurally invalid — would fail before deploy.`,
          evidence: errors.map(e => `${e.code}: ${e.message}`).join(' | '),
          suggestedFix:
            'The merged analyse prompt should constrain step shape (trigger first, no mid-flow triggers) per node-map.',
        });
      }
    }
    if (!findings.length) {
      return [pass('workflow-structure-valid', 'mechanical', 'critical',
        `All ${flows.length} workflow(s) pass structural validation.`)];
    }
    return findings;
  },
};

export const MECHANICAL_RULES: MechanicalRule[] = [
  noInternalIds,
  painPointCoverage,
  toolsCaptured,
  workflowStructureValid,
];

// ── rubric rules (judged by the LLM) ─────────────────────────────────────────

export interface RubricRule {
  id: string;
  severity: FindingSeverity;
  targetPrompt: string;
  title: string;
  /** Plain-language test the judge applies; what a FAIL looks like. */
  guidance: string;
}

export const RUBRIC_RULES: RubricRule[] = [
  {
    id: 'cost-not-disadvantage',
    severity: 'high',
    targetPrompt: 'shared',
    title: 'Kosten nie als Nachteil',
    guidance:
      'The coach must always frame automation cost as an investment that pays for itself through saved time. FAIL if it ever presents cost as a downside, caveat or "Haken".',
  },
  {
    id: 'no-redundant-questions',
    severity: 'medium',
    targetPrompt: 'shared',
    title: 'Keine redundanten Fragen',
    guidance:
      'The coach must not re-ask facts it already knows from onboarding or the canvas, and must not ask abstract/vague questions. FAIL on any clearly redundant or abstract question.',
  },
  {
    id: 'phase2-tools-strict',
    severity: 'medium',
    targetPrompt: 'analyse',
    title: 'Phase 2 Tool-Abfrage',
    guidance:
      'In Phase 2 the coach asks the customer which tools they currently use, strictly per pain point, and does NOT pitch internal/Axantilo tools. FAIL if it presents its own tools or asks tools generically instead of per pain point.',
  },
  {
    id: 'phase3-fewer-paths',
    severity: 'low',
    targetPrompt: 'analyse',
    title: 'Weniger Pfade beim Lösungsentwurf',
    guidance:
      'When designing solutions (mapping part of Analyse & Plan) the coach must not branch into paths/questions for irrelevant implementation details; the number of options should match the customer\'s tempo. FAIL on over-branching into trivial decisions.',
  },
  {
    id: 'impractical-filtered',
    severity: 'high',
    targetPrompt: 'analyse',
    title: 'Unpraktisches herausfiltern',
    guidance:
      'The coach must coldly filter out ideas that are not practical for this customer, instead of designing a workflow for everything. FAIL if it builds/endorses an automation that is clearly impractical for this customer\'s situation.',
  },
  {
    id: 'realistic-automations',
    severity: 'medium',
    targetPrompt: 'analyse',
    title: 'Realistische Automatisierung',
    guidance:
      'Proposed automations must be genuinely doable with the customer\'s actual tool stack and team. FAIL if a proposal assumes tools/skills the customer does not have.',
  },
];

// ── verdict scoring ──────────────────────────────────────────────────────────

const SEVERITY_PENALTY: Record<FindingSeverity, number> = {
  info: 0,
  low: 4,
  medium: 10,
  high: 20,
  critical: 40,
};

export function scoreFindings(findings: Finding[]) {
  const bySeverity: Record<FindingSeverity, number> = {
    info: 0, low: 0, medium: 0, high: 0, critical: 0,
  };
  const byRule: Record<string, boolean> = {};
  let score = 100;
  let hadBlocking = false;
  for (const f of findings) {
    if (f.passed) {
      if (!(f.ruleId in byRule)) byRule[f.ruleId] = false;
      continue;
    }
    byRule[f.ruleId] = true;
    bySeverity[f.severity] += 1;
    score -= SEVERITY_PENALTY[f.severity];
    if (f.severity === 'critical' || f.severity === 'high') hadBlocking = true;
  }
  score = Math.max(0, Math.min(100, score));
  return { score, pass: score >= 70 && !hadBlocking, bySeverity, byRule };
}

function pass(
  ruleId: string,
  kind: 'mechanical' | 'rubric',
  severity: FindingSeverity,
  message: string,
): Finding {
  return { ruleId, kind, passed: true, severity, message };
}
