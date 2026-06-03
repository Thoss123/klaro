import { describe, it, expect } from 'vitest';
import {
  runCanvasPipeline,
  toolsForPainPoint,
  buildWorkerDirective,
} from '@/lib/agent-orchestration';
import type { CompleteJson } from '@/lib/agents/llm';
import type { CanvasData } from '@/lib/types';

const canvas: Partial<CanvasData> = {
  pain_points: [{ id: 'pp_1', title: 'Reels Produktion', description: '', priority: 'hoch' }],
  use_cases: [
    { id: 'uc_1', title: 'Reels', linked_pain_point: 'pp_1', effort: '', impact: '', tools: ['CapCut', 'Meta Business Suite'] },
    { id: 'uc_2', title: 'Other', linked_pain_point: 'pp_2', effort: '', impact: '', tools: ['Excel'] },
  ],
  workflows: [{ id: 'wf_1', title: 'Reels', linked_pain_point: 'pp_1', steps: [{ id: 's1', label: 'Go', type: 'trigger' }] }],
};

const history = [
  { role: 'assistant', content: 'Reden wir über Reels.' },
  { role: 'user', content: 'Ja, das Schneiden und Posten frisst Zeit jede Woche.' },
];

/** Build a fake CompleteJson that returns canned content based on the system prompt. */
function fakeLLM(map: { supervisor: string; research?: string; qa: string }): CompleteJson {
  return async ({ system }) => {
    if (system.includes('Supervisor-Agent')) return { content: map.supervisor, tokens: 10 };
    if (system.includes('Recherche-Agent')) return { content: map.research || '{"bullets":[]}', tokens: 10 };
    if (system.includes('Workflow-QA-Agent')) return { content: map.qa, tokens: 10 };
    return { content: '{}', tokens: 0 };
  };
}

describe('toolsForPainPoint', () => {
  it('returns only tools linked to the given pain point', () => {
    expect(toolsForPainPoint(canvas, 'pp_1').sort()).toEqual(['CapCut', 'Meta Business Suite']);
  });
  it('returns all tools when no pain point given', () => {
    expect(toolsForPainPoint(canvas, null)).toContain('Excel');
  });
});

describe('buildWorkerDirective', () => {
  it('is empty when pipeline did not run', () => {
    expect(buildWorkerDirective({ ran: false, proceed: true, logs: [], totalTokens: 0 })).toBe('');
  });
});

describe('runCanvasPipeline', () => {
  it('short-circuits outside phase=plan', async () => {
    const r = await runCanvasPipeline(fakeLLM({ supervisor: '{}', qa: '{}' }), {
      phase: 'diagnose', history, canvas,
    });
    expect(r.ran).toBe(false);
    expect(r.proceed).toBe(true);
    expect(r.workerDirective).toBe('');
  });

  it('runs all agents and builds a directive when approved', async () => {
    const r = await runCanvasPipeline(
      fakeLLM({
        supervisor: '{"verdict":"approved","active_topic":"Reels Schnitt","target_pain_point":"pp_1","merge_with_existing":true,"instruction_for_worker":"Update wf_1"}',
        research: '{"skip":false,"bullets":["Clipping vor Caption"],"sources_hint":["youtube"],"open_questions":[]}',
        qa: '{"status":"fail","issues":["Reihenfolge"],"fixed_steps":[{"id":"s1","label":"Trigger","type":"trigger"}]}',
      }),
      { phase: 'plan', history, canvas },
    );
    expect(r.ran).toBe(true);
    expect(r.proceed).toBe(true);
    expect(r.supervisor?.verdict).toBe('approved');
    expect(r.research?.bullets).toContain('Clipping vor Caption');
    expect(r.qa?.status).toBe('fail');
    expect(r.workerDirective).toContain('pp_1');
    expect(r.workerDirective).toContain('Clipping vor Caption');
    expect(r.workerDirective).toContain('QA-Korrektur');
    expect(r.totalTokens).toBeGreaterThan(0);
    // supervisor + research + qa = 3 calls
    expect(r.logs).toHaveLength(3);
  });

  it('defers extraction when supervisor blocks', async () => {
    const r = await runCanvasPipeline(
      fakeLLM({ supervisor: '{"verdict":"block","active_topic":"Smalltalk"}', qa: '{}' }),
      { phase: 'plan', history, canvas },
    );
    expect(r.ran).toBe(true);
    expect(r.proceed).toBe(false);
    expect(r.workerDirective).toBe('');
  });

  it('skips research for non-research topics but still runs supervisor + qa', async () => {
    const adminCanvas: Partial<CanvasData> = {
      pain_points: [{ id: 'pp_9', title: 'Rechnungen ablegen', description: '', priority: 'hoch' }],
      use_cases: [],
      workflows: [],
    };
    const r = await runCanvasPipeline(
      fakeLLM({
        supervisor: '{"verdict":"approved","active_topic":"Rechnungen","target_pain_point":"pp_9","merge_with_existing":false,"instruction_for_worker":"Neu"}',
        qa: '{"status":"pass","issues":[]}',
      }),
      { phase: 'plan', history, canvas: adminCanvas },
    );
    expect(r.proceed).toBe(true);
    // research skipped → only supervisor + qa logged
    expect(r.logs.map(l => l.step)).toEqual(['supervisor', 'workflow-qa']);
  });

  it('never throws even if the LLM always rejects', async () => {
    const throwing: CompleteJson = async () => { throw new Error('down'); };
    const r = await runCanvasPipeline(throwing, { phase: 'plan', history, canvas });
    // supervisor fails open → approved → pipeline proceeds
    expect(r.proceed).toBe(true);
  });
});
