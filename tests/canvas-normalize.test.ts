import { describe, it, expect } from 'vitest';
import {
  toDisplayText,
  normalizeCompanyProfile,
  parseToolList,
  filterToolsFromUserChat,
  inferDocumentPhase,
  isValidWorkflow,
  normalizeCanvasData,
} from '@/lib/canvas-normalize';
import { stripPhaseFromCanvas } from '@/lib/phase-reset';
import type { CanvasData, Workflow } from '@/lib/types';

describe('toDisplayText', () => {
  it('handles primitives, arrays and nested objects', () => {
    expect(toDisplayText('  hi ')).toBe('hi');
    expect(toDisplayText(42)).toBe('42');
    expect(toDisplayText(['a', 'b'])).toBe('a · b');
    expect(toDisplayText({ text: 'x' })).toBe('x');
    expect(toDisplayText({ a: '1', b: '2' })).toBe('a: 1 · b: 2');
    expect(toDisplayText(null)).toBe('');
  });
});

describe('normalizeCompanyProfile', () => {
  it('maps aliases and splits process steps', () => {
    const c = normalizeCompanyProfile({
      services: 'Beratung',
      zielkunden: 'KMU',
      ablauf: 'Akquise; Angebot; Umsetzung',
    });
    expect(c?.offer).toBe('Beratung');
    expect(c?.target_customers).toBe('KMU');
    expect(c?.process_steps).toEqual(['Akquise', 'Angebot', 'Umsetzung']);
  });

  it('returns undefined for empty input', () => {
    expect(normalizeCompanyProfile({})).toBeUndefined();
    expect(normalizeCompanyProfile(null)).toBeUndefined();
  });
});

describe('parseToolList', () => {
  it('normalizes compound tool names and dedupes', () => {
    expect(parseToolList('chat gpt, cap cut')).toEqual(['ChatGPT', 'CapCut']);
    expect(parseToolList('Word\nWord')).toEqual(['Word']);
  });
});

describe('filterToolsFromUserChat', () => {
  it('keeps only tools the user actually mentioned', () => {
    const history = [{ role: 'user', content: 'Wir nutzen Canva und Word' }];
    expect(filterToolsFromUserChat(['Canva', 'Photoshop'], history)).toEqual(['Canva']);
  });
  it('returns all tools when there is no user text', () => {
    expect(filterToolsFromUserChat(['X'], [])).toEqual(['X']);
  });
});

describe('inferDocumentPhase', () => {
  it('infers phase from content keywords', () => {
    expect(inferDocumentPhase({ title: 'Deploy', content: 'go-live credential' })).toBe('umsetzung');
    expect(inferDocumentPhase({ title: 'Plan', content: 'workflow blaupause' })).toBe('plan');
    expect(inferDocumentPhase({ title: 'Tools', content: 'marketing stack canva' })).toBe('analyse');
    expect(inferDocumentPhase({ title: 'X', content: 'allgemein' })).toBe('diagnose');
  });
  it('respects an explicit valid phase', () => {
    expect(inferDocumentPhase({ title: 'X', content: 'y', phase: 'plan' })).toBe('plan');
  });
});

describe('isValidWorkflow', () => {
  it('validates title + steps with labels', () => {
    const ok: Workflow = { id: 'w', title: 'T', linked_pain_point: 'p', steps: [{ id: 's', label: 'L' }] };
    expect(isValidWorkflow(ok)).toBe(true);
    expect(isValidWorkflow({ ...ok, steps: [] })).toBe(false);
  });
});

describe('stripPhaseFromCanvas', () => {
  const base: CanvasData = {
    phase: 'plan',
    pain_points: [{ id: 'pp_1', title: 'P', description: 'd', priority: 'hoch' }],
    use_cases: [{ id: 'uc_1', title: 'U', linked_pain_point: 'pp_1', effort: 'x', impact: 'y' }],
    workflows: [{ id: 'wf_1', title: 'W', linked_pain_point: 'pp_1', steps: [{ id: 's1', label: 'Go' }] }],
    documents: [
      { id: 'd1', title: 'Diag', content: 'allgemein diagnose text here enough', phase: 'diagnose' },
      { id: 'd2', title: 'Plan', content: 'workflow blaupause text here enough', phase: 'plan' },
    ],
    company: { offer: 'Beratung', change_appetite: 'balanced' },
    implementer: { id: 'i1', is_chatter: true, who: 'Chef', skill_level: 'grundkenntnisse', automation_experience: 'nein' },
  };

  it('clears diagnose blobs but keeps later phases', () => {
    const c = stripPhaseFromCanvas(base, 'diagnose');
    expect(c.pain_points).toHaveLength(0);
    expect(c.company).toBeUndefined();
    expect(c.use_cases).toHaveLength(1);
    expect(c.documents.map(d => d.id)).toEqual(['d2']);
  });

  it('clears analyse blobs but keeps pain points', () => {
    const c = stripPhaseFromCanvas(base, 'analyse');
    expect(c.use_cases).toHaveLength(0);
    expect(c.implementer).toBeUndefined();
    expect(c.pain_points).toHaveLength(1);
    expect(c.company?.offer).toBe('Beratung');
    expect(c.company?.change_appetite).toBeUndefined();
  });

  it('clears plan workflows and docs', () => {
    const c = stripPhaseFromCanvas(base, 'plan');
    expect(c.workflows).toHaveLength(0);
    expect(c.documents.map(d => d.id)).toEqual(['d1']);
  });

  it('clears umsetzung workflows and docs', () => {
    const c = stripPhaseFromCanvas(base, 'umsetzung');
    expect(c.workflows).toHaveLength(0);
    expect(c.documents.map(d => d.id)).toEqual(['d1', 'd2']);
    expect(c.pain_points).toHaveLength(1);
  });
});

describe('normalizeCanvasData', () => {
  it('extracts workflows only in plan/umsetzung', () => {
    const raw = {
      workflows: [{ id: 'wf_1', title: 'A B', linked_pain_point: 'pp_1', steps: [{ id: 's1', label: 'Go', type: 'trigger' }] }],
    };
    const inPlan = normalizeCanvasData(raw, null, 'plan');
    expect(inPlan.workflows).toHaveLength(1);

    const inDiagnose = normalizeCanvasData(raw, null, 'diagnose');
    expect(inDiagnose.workflows).toHaveLength(0);
  });

  it('shortens overly long workflow titles to 5 words', () => {
    const raw = {
      workflows: [{ id: 'wf_1', title: 'Eins Zwei Drei Vier Fünf Sechs Sieben', linked_pain_point: 'pp_1', steps: [{ id: 's1', label: 'Go' }] }],
    };
    const c = normalizeCanvasData(raw, null, 'plan');
    expect(c.workflows[0].title.split(/\s+/)).toHaveLength(5);
  });

  it('keeps existing pain_points when none provided', () => {
    const current = { pain_points: [{ id: 'pp_1', title: 'Keep', description: 'd', priority: 'hoch' as const }] };
    const c = normalizeCanvasData({}, current, 'analyse');
    expect(c.pain_points).toHaveLength(1);
    expect(c.pain_points[0].title).toBe('Keep');
  });

  it('does not duplicate a workflow for the same pain point', () => {
    const current = { workflows: [{ id: 'wf_1', title: 'Orig', linked_pain_point: 'pp_1', steps: [{ id: 's1', label: 'Go' }] }] };
    const raw = { workflows: [{ id: 'wf_2', title: 'New', linked_pain_point: 'pp_1', steps: [{ id: 's2', label: 'Go2' }] }] };
    const c = normalizeCanvasData(raw, current, 'plan');
    expect(c.workflows).toHaveLength(1); // merged, not duplicated
  });
});
