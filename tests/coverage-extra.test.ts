import { describe, it, expect } from 'vitest';
import { mistralCompleteJson } from '@/lib/agents/llm';
import { logSync } from '@/lib/sync-decision';
import { toDisplayText, normalizeCanvasData } from '@/lib/canvas-normalize';

describe('mistralCompleteJson', () => {
  it('returns content + token usage from a Mistral-like client', async () => {
    const client = {
      chat: { complete: async () => ({ choices: [{ message: { content: '{"x":1}' } }], usage: { totalTokens: 7 } }) },
    };
    const fn = mistralCompleteJson(client as never);
    const r = await fn({ system: 's', user: 'u' });
    expect(r.content).toBe('{"x":1}');
    expect(r.tokens).toBe(7);
  });

  it('estimates tokens when usage is absent and coerces non-string content', async () => {
    const client = {
      chat: { complete: async () => ({ choices: [{ message: { content: [{ type: 'text', text: 'hi' }] } }] }) },
    };
    const fn = mistralCompleteJson(client as never);
    const r = await fn({ system: 'abcd', user: 'efgh' });
    expect(r.content).toBe('');
    expect(r.tokens).toBeGreaterThan(0);
  });
});

describe('logSync', () => {
  it('logs with and without meta without throwing', () => {
    expect(() => logSync('canvas', 'success', 'done', { a: 1 })).not.toThrow();
    expect(() => logSync('memory', 'skip', 'no facts')).not.toThrow();
  });
});

describe('toDisplayText edge cases', () => {
  it('prefers description then label keys', () => {
    expect(toDisplayText({ description: 'd' })).toBe('d');
    expect(toDisplayText({ label: 'l' })).toBe('l');
    expect(toDisplayText(true)).toBe('true');
  });
});

describe('normalizeCanvasData — use cases, documents, pain points', () => {
  it('normalizes use cases and filters tools against user chat', () => {
    const raw = {
      use_cases: [
        { id: 'uc_1', title: 'Marketing', linked_pain_point: 'pp_1', tools: 'Canva, Photoshop' },
        { notitle: true },
      ],
    };
    const history = [{ role: 'user', content: 'Wir nutzen Canva.' }];
    const c = normalizeCanvasData(raw, null, 'analyse', history);
    expect(c.use_cases).toHaveLength(1);
    expect(c.use_cases[0].tools).toEqual(['Canva']); // Photoshop filtered out
  });

  it('normalizes documents and infers their phase', () => {
    const raw = {
      documents: [
        { id: 'd1', title: 'Tool Stack', content: 'Wir nutzen Canva und Airtable im Marketing-Stack.' },
        { title: 'too short', content: 'x' },
      ],
    };
    const c = normalizeCanvasData(raw, null, 'analyse');
    expect(c.documents).toHaveLength(1);
    expect(c.documents[0].phase).toBe('analyse');
  });

  it('normalizes pain points with priority/frequency/rank', () => {
    const raw = {
      pain_points: [
        { id: 'pp_1', title: 'Angebote', description: 'dauert lang', frequency: '5/Monat', priority: 'mittel', rank: 1 },
        { junk: true },
      ],
    };
    const c = normalizeCanvasData(raw, null, 'diagnose');
    expect(c.pain_points).toHaveLength(1);
    expect(c.pain_points[0].priority).toBe('mittel');
    expect(c.pain_points[0].rank).toBe(1);
  });
});
