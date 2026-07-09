/**
 * Tests für lib/agents/model-proxy.ts — der gemeinsame, gemeterte Mistral-Chat-Kern
 * hinter /api/agent/model UND den OpenAI-kompatiblen /api/agent/v1/*-Routen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const completeMock = vi.fn();

vi.mock('@mistralai/mistralai', () => ({
  Mistral: vi.fn().mockImplementation(() => ({
    chat: { complete: completeMock },
  })),
}));

import { checkAffordable, completeChat, defaultChatModel } from '@/lib/agents/model-proxy';

describe('completeChat', () => {
  const prevBilling = process.env.BILLING_DISABLED;
  const prevKey = process.env.MISTRAL_API_KEY;

  beforeEach(() => {
    process.env.BILLING_DISABLED = 'true'; // Credit-Checks umgehen, Fokus auf den Model-Call
    process.env.MISTRAL_API_KEY = 'test-key';
    completeMock.mockReset();
  });
  afterEach(() => {
    process.env.BILLING_DISABLED = prevBilling;
    process.env.MISTRAL_API_KEY = prevKey;
  });

  it('rejects an empty messages array without calling Mistral', async () => {
    const res = await completeChat({ userId: 'u1', projectId: 'p1', messages: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('returns 500 when MISTRAL_API_KEY is missing', async () => {
    delete process.env.MISTRAL_API_KEY;
    const res = await completeChat({
      userId: 'u1', projectId: 'p1', messages: [{ role: 'user', content: 'hi' }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(500);
  });

  it('calls Mistral with the given model and returns the assistant message + usage', async () => {
    completeMock.mockResolvedValue({
      choices: [{ message: { content: 'Hallo!', toolCalls: null } }],
      usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
    });
    const res = await completeChat({
      userId: 'u1',
      projectId: 'p1',
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.message.content).toBe('Hallo!');
      expect(res.model).toBe('mistral-small-latest');
      expect(res.usage).toEqual({ promptTokens: 10, completionTokens: 4, totalTokens: 14 });
    }
    expect(completeMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'mistral-small-latest' }));
  });

  it('falls back to defaultChatModel() when no model given', async () => {
    completeMock.mockResolvedValue({
      choices: [{ message: { content: 'x', toolCalls: null } }],
      usage: {},
    });
    await completeChat({ userId: 'u1', projectId: 'p1', messages: [{ role: 'user', content: 'hi' }] });
    expect(completeMock).toHaveBeenCalledWith(expect.objectContaining({ model: defaultChatModel() }));
  });

  it('passes through tool_calls from the Mistral response', async () => {
    completeMock.mockResolvedValue({
      choices: [{ message: { content: '', toolCalls: [{ id: 'c1', function: { name: 'x', arguments: '{}' } }] } }],
      usage: {},
    });
    const res = await completeChat({ userId: 'u1', projectId: 'p1', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.message.toolCalls).toEqual([{ id: 'c1', function: { name: 'x', arguments: '{}' } }]);
  });

  it('returns 502 when the Mistral call throws', async () => {
    completeMock.mockRejectedValue(new Error('network down'));
    const res = await completeChat({ userId: 'u1', projectId: 'p1', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(502);
      expect(res.error).toContain('network down');
    }
  });
});

describe('checkAffordable', () => {
  const prevBilling = process.env.BILLING_DISABLED;
  afterEach(() => {
    process.env.BILLING_DISABLED = prevBilling;
  });

  it('always affordable when billing is disabled', async () => {
    process.env.BILLING_DISABLED = 'true';
    await expect(checkAffordable('u1')).resolves.toBe(true);
  });
});
