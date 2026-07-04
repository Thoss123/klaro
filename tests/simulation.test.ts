import { describe, it, expect } from 'vitest';
import {
  parsePhaseComplete,
  hasCanvasTrigger,
  hasWorkflowPlan,
  parseWorkflowPlans,
  parseTurnSignals,
} from '@/lib/simulation/tags';
import {
  MECHANICAL_RULES,
  scoreFindings,
  type JudgeContext,
} from '@/lib/simulation/rules';
import {
  mechanicalFindings,
  normalizeRubricVerdicts,
  finalizeVerdict,
  rubricRuleSpecs,
} from '@/lib/simulation/judge';
import { getPersona, SEED_PERSONAS } from '@/lib/simulation/personas';
import type { CanvasData } from '@/lib/types';
import type { Finding, Persona, TranscriptTurn } from '@/lib/simulation/types';

const persona = getPersona('profil-1') as Persona;

function canvas(extra: Partial<CanvasData> = {}): CanvasData {
  return { pain_points: [], use_cases: [], workflows: [], documents: [], phase: 'analyse', ...extra };
}
function coachTurn(content: string): TranscriptTurn {
  return { turn: 0, phase: 'diagnose', role: 'coach', content, signals: {} };
}

describe('tags', () => {
  it('parses a phase_complete tag to a valid phase', () => {
    expect(parsePhaseComplete('blah <phase_complete>diagnose</phase_complete>')).toBe('diagnose');
    expect(parsePhaseComplete('<phase_complete>nonsense</phase_complete>')).toBeUndefined();
    expect(parsePhaseComplete('nothing here')).toBeUndefined();
  });

  it('detects canvas trigger and workflow plan tags', () => {
    expect(hasCanvasTrigger('x <trigger_canvas_update></trigger_canvas_update>')).toBe(true);
    expect(hasCanvasTrigger('nope')).toBe(false);
    expect(hasWorkflowPlan('<workflow_plan>{"a":1}</workflow_plan>')).toBe(true);
  });

  it('parses workflow plan JSON and skips malformed blocks', () => {
    const text = '<workflow_plan>{"title":"A","steps":[]}</workflow_plan><workflow_plan>{bad</workflow_plan>';
    const plans = parseWorkflowPlans(text);
    expect(plans).toHaveLength(1);
    expect(plans[0].title).toBe('A');
  });

  it('collapses a turn into structured signals', () => {
    const sig = parseTurnSignals('done <phase_complete>analyse</phase_complete> <trigger_canvas_update></trigger_canvas_update>');
    expect(sig.phaseComplete).toBe('analyse');
    expect(sig.canvasTrigger).toBe(true);
  });
});

describe('mechanical rules', () => {
  const ctx = (over: Partial<JudgeContext>): JudgeContext => ({
    persona,
    transcript: [],
    canvas: canvas(),
    phasesRun: ['diagnose', 'analyse'],
    ...over,
  });

  it('flags leaked internal IDs in coach text', () => {
    const rule = MECHANICAL_RULES.find(r => r.id === 'no-internal-ids')!;
    const findings = rule.run(ctx({ transcript: [coachTurn('Dein Problem pp_3 ist gelöst.')] }));
    expect(findings.some(f => !f.passed)).toBe(true);
  });

  it('passes clean coach text', () => {
    const rule = MECHANICAL_RULES.find(r => r.id === 'no-internal-ids')!;
    const findings = rule.run(ctx({ transcript: [coachTurn('Alles gut, lass uns weitermachen.')] }));
    expect(findings.every(f => f.passed)).toBe(true);
  });

  it('fails workflow validation when a flow has no trigger', () => {
    const rule = MECHANICAL_RULES.find(r => r.id === 'workflow-structure-valid')!;
    const bad = canvas({
      workflow_plans: [{
        id: 'w1', title: 'No trigger', linked_pain_point: 'pp_1',
        steps: [{ id: 's1', label: 'Send mail', type: 'action' }],
      }],
    });
    const findings = rule.run(ctx({ canvas: bad }));
    expect(findings.some(f => !f.passed && f.severity === 'critical')).toBe(true);
  });

  it('reports missing pain-point coverage', () => {
    const rule = MECHANICAL_RULES.find(r => r.id === 'painpoint-coverage')!;
    const findings = rule.run(ctx({ canvas: canvas({ pain_points: [], phase: 'diagnose' }) }));
    expect(findings.some(f => !f.passed)).toBe(true);
  });

  it('skips coverage when the phase stalled (turn cap, canvas not yet written)', () => {
    const rule = MECHANICAL_RULES.find(r => r.id === 'painpoint-coverage')!;
    const findings = rule.run(ctx({
      canvas: canvas({ pain_points: [], phase: 'diagnose' }),
      stalledPhases: ['diagnose'],
    }));
    expect(findings.every(f => f.passed)).toBe(true);
  });
});

describe('scoreFindings', () => {
  it('penalises by severity and blocks pass on high/critical', () => {
    const findings: Finding[] = [
      { ruleId: 'a', kind: 'mechanical', passed: true, severity: 'info', message: 'ok' },
      { ruleId: 'b', kind: 'rubric', passed: false, severity: 'high', message: 'bad' },
    ];
    const v = scoreFindings(findings);
    expect(v.score).toBe(80);
    expect(v.pass).toBe(false);
    expect(v.byRule.b).toBe(true);
  });

  it('passes a clean run', () => {
    const v = scoreFindings([
      { ruleId: 'a', kind: 'mechanical', passed: true, severity: 'info', message: 'ok' },
    ]);
    expect(v.score).toBe(100);
    expect(v.pass).toBe(true);
  });
});

describe('deferred judging (Claude Code is the judge)', () => {
  it('exposes every rubric rule for Claude to judge', () => {
    const specs = rubricRuleSpecs();
    expect(specs.some(s => s.id === 'cost-not-disadvantage')).toBe(true);
    expect(specs.every(s => s.guidance.length > 0)).toBe(true);
  });

  it('normalizes Claude\'s rubric verdicts and fills the ones it skipped', () => {
    const findings = normalizeRubricVerdicts([
      { ruleId: 'cost-not-disadvantage', passed: false, severity: 'high', message: 'framed as drawback', evidence: 'kostet leider' },
    ]);
    const cost = findings.find(f => f.ruleId === 'cost-not-disadvantage')!;
    expect(cost.passed).toBe(false);
    expect(cost.kind).toBe('rubric');
    // every rubric rule is represented (skipped ones become info-passes)
    expect(findings).toHaveLength(rubricRuleSpecs().length);
    expect(findings.filter(f => f.ruleId === 'phase3-fewer-paths')[0].passed).toBe(true);
  });

  it('combines mechanical + rubric into a scored verdict', () => {
    const mechanical = mechanicalFindings({
      persona,
      transcript: [coachTurn('Alles gut.')],
      canvas: canvas({ phase: 'diagnose' }),
      phasesRun: ['diagnose'],
    });
    const rubric = normalizeRubricVerdicts([
      { ruleId: 'cost-not-disadvantage', passed: false, severity: 'high', message: 'bad' },
    ]);
    const { verdict } = finalizeVerdict(mechanical, rubric);
    expect(verdict.byRule['cost-not-disadvantage']).toBe(true);
    expect(verdict.pass).toBe(false);
  });
});

describe('personas', () => {
  it('exposes the seed personas with ground truth', () => {
    expect(SEED_PERSONAS.length).toBeGreaterThanOrEqual(4);
    for (const p of SEED_PERSONAS) {
      expect(p.slug).toMatch(/^[a-z0-9-]+$/);
      expect(p.groundTruth.expectedPainPoints?.length).toBeGreaterThan(0);
    }
  });
});
