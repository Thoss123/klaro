import { describe, it, expect } from 'vitest';
import {
  buildSupervisorPrompt,
  parseSupervisorResult,
  runSupervisor,
  renderChatSlice,
} from '@/lib/agents/supervisor';
import type { CompleteJson } from '@/lib/agents/llm';

const canvas = {
  pain_points: [{ id: 'pp_1', title: 'Reels', description: '', priority: 'hoch' as const }],
  workflows: [{ id: 'wf_1', title: 'Reels', linked_pain_point: 'pp_1', steps: [{ id: 's1', label: 'Go' }] }],
};
const history = [
  { role: 'assistant', content: 'Reden wir über deine Reels-Produktion.' },
  { role: 'user', content: 'Ja, das Schneiden dauert ewig.' },
];

describe('renderChatSlice', () => {
  it('renders last N labelled lines and drops tiny ones', () => {
    const out = renderChatSlice(history);
    expect(out).toContain('Nutzer: Ja, das Schneiden dauert ewig.');
    expect(out).toContain('Coach:');
  });
});

describe('buildSupervisorPrompt', () => {
  it('includes pain points and workflows in the system prompt', () => {
    const { system, user } = buildSupervisorPrompt({ phase: 'plan', history, canvas });
    expect(system).toContain('pp_1');
    expect(system).toContain('wf_1');
    expect(user).toContain('Schneiden');
  });
});

describe('parseSupervisorResult', () => {
  it('parses an approved verdict', () => {
    const r = parseSupervisorResult('{"verdict":"approved","active_topic":"Reels","target_pain_point":"pp_1","merge_with_existing":true,"instruction_for_worker":"Update wf_1"}');
    expect(r.verdict).toBe('approved');
    expect(r.target_pain_point).toBe('pp_1');
    expect(r.merge_with_existing).toBe(true);
  });

  it('normalizes invalid verdict and null pain point', () => {
    const r = parseSupervisorResult('{"verdict":"weird","target_pain_point":"null"}');
    expect(r.verdict).toBe('approved');
    expect(r.target_pain_point).toBeNull();
  });

  it('fails open on unparseable content', () => {
    const r = parseSupervisorResult('garbage');
    expect(r.verdict).toBe('approved');
    expect(r.merge_with_existing).toBe(false);
  });
});

describe('runSupervisor', () => {
  it('returns parsed data and tokens from the completion', async () => {
    const fake: CompleteJson = async () => ({ content: '{"verdict":"block","active_topic":"x"}', tokens: 123 });
    const r = await runSupervisor(fake, { phase: 'plan', history, canvas });
    expect(r.ok).toBe(true);
    expect(r.data.verdict).toBe('block');
    expect(r.tokens).toBe(123);
  });

  it('degrades to approved on a thrown error', async () => {
    const fake: CompleteJson = async () => { throw new Error('network'); };
    const r = await runSupervisor(fake, { phase: 'plan', history, canvas });
    expect(r.ok).toBe(false);
    expect(r.data.verdict).toBe('approved');
    expect(r.error).toBe('network');
  });
});
