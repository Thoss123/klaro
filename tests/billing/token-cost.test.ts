import { describe, expect, it } from 'vitest';
import { CREDITS_PER_EURO, TEST_STARTING_CREDITS, TEST_TOPUP_CREDITS } from '@/lib/billing/credit-constants';
import { computeProviderCostEur, eurToCredits, normalizeTokenUsage, usageToCredits } from '@/lib/billing/token-cost';

describe('billing credit constants', () => {
  it('maps the testphase budget to credits', () => {
    expect(CREDITS_PER_EURO).toBe(400);
    expect(TEST_STARTING_CREDITS).toBe(2_000);
    expect(TEST_TOPUP_CREDITS).toBe(6_000);
    expect(eurToCredits(5)).toBe(2_000);
    expect(eurToCredits(15)).toBe(6_000);
  });
});

describe('normalizeTokenUsage', () => {
  it('accepts Anthropic snake_case usage', () => {
    expect(
      normalizeTokenUsage({
        input_tokens: 100,
        output_tokens: 25,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 50,
      }),
    ).toEqual({
      inputTokens: 100,
      outputTokens: 25,
      cacheCreationInputTokens: 10,
      cacheReadInputTokens: 50,
    });
  });

  it('accepts Mistral camelCase usage', () => {
    expect(normalizeTokenUsage({ promptTokens: 100, completionTokens: 20 })).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });
  });
});

describe('computeProviderCostEur', () => {
  it('computes Haiku 4.5 input and output cost', () => {
    const cost = computeProviderCostEur(
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      'claude-haiku-4-5',
    );

    expect(cost).toBe(6);
    expect(usageToCredits({ inputTokens: 1_000_000 }, 'claude-haiku-4-5')).toBe(400);
  });

  it('subtracts cached Anthropic tokens from normal input pricing', () => {
    const cost = computeProviderCostEur(
      {
        input_tokens: 100_000,
        output_tokens: 0,
        cache_creation_input_tokens: 20_000,
        cache_read_input_tokens: 60_000,
      },
      'claude-haiku-4-5',
    );

    expect(cost).toBeCloseTo(0.051, 6);
  });

  it('rounds positive euro costs up to at least one credit', () => {
    expect(eurToCredits(0)).toBe(0);
    expect(eurToCredits(0.0001)).toBe(1);
    expect(eurToCredits(0.03)).toBe(12);
  });
});

