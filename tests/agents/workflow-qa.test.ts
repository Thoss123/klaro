import { describe, it, expect } from 'vitest';
import {
  staticWorkflowChecks,
  buildWorkflowQAPrompt,
  normalizeFixedSteps,
  parseWorkflowQAResult,
  runWorkflowQA,
} from '@/lib/agents/workflow-qa';
import type { CompleteJson } from '@/lib/agents/llm';
import type { Workflow } from '@/lib/types';

const goodWf: Workflow = {
  id: 'wf_1',
  title: 'Reels Pipeline Kurz',
  linked_pain_point: 'pp_1',
  steps: [
    { id: 's1', label: 'Trigger', type: 'trigger' },
    { id: 's2', label: 'KI Skript', type: 'ai' },
    { id: 's3', label: 'Veröffentlichen', type: 'output' },
  ],
};

describe('staticWorkflowChecks', () => {
  it('flags an overly long title', () => {
    const issues = staticWorkflowChecks({ ...goodWf, title: 'Eins Zwei Drei Vier Fünf Sechs' });
    expect(issues.some(i => i.includes('Titel zu lang'))).toBe(true);
  });

  it('flags too few steps', () => {
    const issues = staticWorkflowChecks({ ...goodWf, steps: [goodWf.steps[0]] });
    expect(issues.some(i => i.includes('zu dünn'))).toBe(true);
  });

  it('flags publish-before-content order', () => {
    const wf: Workflow = {
      ...goodWf,
      steps: [
        { id: 's1', label: 'Trigger', type: 'trigger' },
        { id: 's2', label: 'In Suite veröffentlichen', type: 'output' },
        { id: 's3', label: 'Video Schnitt', type: 'action' },
      ],
    };
    const issues = staticWorkflowChecks(wf);
    expect(issues.some(i => i.includes('Reihenfolge falsch'))).toBe(true);
  });

  it('returns no issues for a clean workflow', () => {
    expect(staticWorkflowChecks(goodWf)).toEqual([]);
  });

  it('returns empty for null', () => {
    expect(staticWorkflowChecks(null)).toEqual([]);
  });
});

describe('buildWorkflowQAPrompt', () => {
  it('includes research bullets when present', () => {
    const { user } = buildWorkflowQAPrompt({
      topic: 'Reels', painPointTitle: 'Reels', tools: ['CapCut'],
      currentWorkflow: goodWf,
      research: { skip: false, bullets: ['Clipping zuerst'], sources_hint: [], open_questions: [] },
    });
    expect(user).toContain('Clipping zuerst');
    expect(user).toContain('CapCut');
  });
});

describe('normalizeFixedSteps', () => {
  it('normalizes step types and ids', () => {
    const steps = normalizeFixedSteps([
      { label: 'A', type: 'trigger' },
      { label: 'B', type: 'weird' },
      { nope: true },
    ]);
    expect(steps).toHaveLength(2);
    expect(steps?.[0].id).toBe('s1');
    expect(steps?.[1].type).toBe('action'); // invalid → action
  });
  it('returns undefined for non-arrays/empty', () => {
    expect(normalizeFixedSteps(null)).toBeUndefined();
    expect(normalizeFixedSteps([])).toBeUndefined();
  });
});

describe('parseWorkflowQAResult', () => {
  it('merges static + llm issues and forces fail', () => {
    const r = parseWorkflowQAResult('{"status":"pass","issues":["LLM issue"]}', ['Static issue']);
    expect(r.status).toBe('fail');
    expect(r.issues).toContain('Static issue');
    expect(r.issues).toContain('LLM issue');
  });

  it('passes when no issues anywhere', () => {
    const r = parseWorkflowQAResult('{"status":"pass","issues":[]}', []);
    expect(r.status).toBe('pass');
  });

  it('uses static issues when content unparseable', () => {
    const r = parseWorkflowQAResult('garbage', ['Static']);
    expect(r.status).toBe('fail');
    expect(r.issues).toEqual(['Static']);
  });
});

describe('runWorkflowQA', () => {
  it('returns parsed result with fixed steps', async () => {
    const fake: CompleteJson = async () => ({
      content: '{"status":"fail","issues":["x"],"fixed_steps":[{"label":"A","type":"trigger"}]}',
      tokens: 80,
    });
    const r = await runWorkflowQA(fake, { topic: 't', painPointTitle: 'p', tools: [], currentWorkflow: goodWf });
    expect(r.data.fixed_steps).toHaveLength(1);
  });

  it('degrades to static checks on error', async () => {
    const fake: CompleteJson = async () => { throw new Error('x'); };
    const badWf = { ...goodWf, title: 'Eins Zwei Drei Vier Fünf Sechs Sieben' };
    const r = await runWorkflowQA(fake, { topic: 't', painPointTitle: 'p', tools: [], currentWorkflow: badWf });
    expect(r.ok).toBe(false);
    expect(r.data.status).toBe('fail');
  });
});
