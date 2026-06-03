import { describe, it, expect } from 'vitest';
import {
  topicNeedsResearch,
  buildResearchPrompt,
  parseResearchResult,
  runTopicResearch,
} from '@/lib/agents/topic-research';
import type { CompleteJson } from '@/lib/agents/llm';

describe('topicNeedsResearch', () => {
  it('returns true for content/marketing topics', () => {
    expect(topicNeedsResearch('YouTube zu Reels', 'Reels')).toBe(true);
    expect(topicNeedsResearch('Lead Akquise', '')).toBe(true);
  });
  it('returns false for admin/short topics', () => {
    expect(topicNeedsResearch('Rechnungen ablegen', 'Buchhaltung')).toBe(false);
    expect(topicNeedsResearch('', '')).toBe(false);
  });
});

describe('buildResearchPrompt', () => {
  it('includes topic, tools and chat slice', () => {
    const { system, user } = buildResearchPrompt({
      topic: 'Reels',
      painPointTitle: 'Reels',
      tools: ['CapCut'],
      history: [{ role: 'user', content: 'Schneiden dauert ewig bei uns.' }],
    });
    expect(system).toContain('Recherche-Agent');
    expect(user).toContain('CapCut');
    expect(user).toContain('Schneiden');
  });
});

describe('parseResearchResult', () => {
  it('parses bullets and sets skip false', () => {
    const r = parseResearchResult('{"skip":false,"bullets":["Clipping vor Caption"],"sources_hint":["youtube"],"open_questions":[]}');
    expect(r.skip).toBe(false);
    expect(r.bullets).toEqual(['Clipping vor Caption']);
  });
  it('treats empty bullets as skip', () => {
    const r = parseResearchResult('{"skip":false,"bullets":[]}');
    expect(r.skip).toBe(true);
  });
  it('skips on unparseable content', () => {
    expect(parseResearchResult('x').skip).toBe(true);
  });
});

describe('runTopicResearch', () => {
  it('returns parsed brief', async () => {
    const fake: CompleteJson = async () => ({ content: '{"bullets":["a"]}', tokens: 50 });
    const r = await runTopicResearch(fake, { topic: 't', painPointTitle: 'p', tools: [], history: [] });
    expect(r.ok).toBe(true);
    expect(r.data.bullets).toEqual(['a']);
  });
  it('degrades to skip on error', async () => {
    const fake: CompleteJson = async () => { throw new Error('boom'); };
    const r = await runTopicResearch(fake, { topic: 't', painPointTitle: 'p', tools: [], history: [] });
    expect(r.ok).toBe(false);
    expect(r.data.skip).toBe(true);
  });
});
