import { afterEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildDebitRpcParams,
  canAfford,
  debitFromUsage,
  grantCredits,
} from '@/lib/billing/credits';

describe('buildDebitRpcParams', () => {
  it('maps token usage and metadata to the debit RPC shape', () => {
    const params = buildDebitRpcParams(
      {
        userId: 'user-1',
        usage: { input_tokens: 100, output_tokens: 20 },
        model: 'claude-haiku-4-5',
        action: 'chat',
        projectId: 'project-1',
        sessionId: 'session-1',
        metadata: { phase: 'diagnose' },
      },
      1,
      0.00123456,
    );

    expect(params).toEqual({
      p_user_id: 'user-1',
      p_credits: 1,
      p_action: 'chat',
      p_project_id: 'project-1',
      p_session_id: 'session-1',
      p_api_cost_eur: 0.001235,
      p_input_tokens: 100,
      p_output_tokens: 20,
      p_model: 'claude-haiku-4-5',
      p_metadata: { phase: 'diagnose' },
    });
  });
});

describe('debitFromUsage', () => {
  it('debits credits through the RPC using actual usage cost', async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    const client = {
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args });
        return { data: [{ credits_balance: 1999, ledger_id: 'ledger-1' }], error: null };
      },
    } as unknown as SupabaseClient;

    const result = await debitFromUsage(
      {
        userId: 'user-1',
        usage: { inputTokens: 1_000 },
        model: 'claude-haiku-4-5',
        action: 'chat',
      },
      client,
    );

    expect(calls[0]?.name).toBe('debit_user_credits');
    expect(result).toMatchObject({
      credits: 1,
      creditsBalance: 1999,
      ledgerId: 'ledger-1',
    });
  });
});

describe('billing disabled mode', () => {
  const previous = process.env.BILLING_DISABLED;

  afterEach(() => {
    process.env.BILLING_DISABLED = previous;
  });

  it('allows requests without a database lookup', async () => {
    process.env.BILLING_DISABLED = 'true';

    await expect(canAfford('user-1', 999_999)).resolves.toMatchObject({ ok: true });
    await expect(
      debitFromUsage({
        userId: 'user-1',
        usage: { inputTokens: 1_000_000 },
        model: 'claude-haiku-4-5',
        action: 'chat',
      }),
    ).resolves.toMatchObject({
      credits: 400,
      creditsBalance: Number.MAX_SAFE_INTEGER,
      ledgerId: null,
    });
  });
});

describe('grantCredits', () => {
  it('rejects invalid grants before hitting the database', async () => {
    await expect(
      grantCredits({ userId: 'user-1', credits: 0 }),
    ).rejects.toThrow('positive Ganzzahl');
  });
});

