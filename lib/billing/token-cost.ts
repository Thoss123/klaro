import { CREDITS_PER_EURO } from '@/lib/billing/credit-constants';
import { getModelPrice, type ModelPrice } from '@/lib/billing/model-prices';

export type TokenUsage = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheCreationInputTokens?: number | null;
  cacheReadInputTokens?: number | null;
  totalTokens?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
};

export type NormalizedTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
};

function positiveInteger(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.ceil(value)
    : 0;
}

export function normalizeTokenUsage(usage: TokenUsage): NormalizedTokenUsage {
  const inputTokens = positiveInteger(
    usage.inputTokens ?? usage.input_tokens ?? usage.promptTokens ?? usage.prompt_tokens,
  );
  const outputTokens = positiveInteger(
    usage.outputTokens ?? usage.output_tokens ?? usage.completionTokens ?? usage.completion_tokens,
  );
  const cacheCreationInputTokens = positiveInteger(
    usage.cacheCreationInputTokens ?? usage.cache_creation_input_tokens,
  );
  const cacheReadInputTokens = positiveInteger(
    usage.cacheReadInputTokens ?? usage.cache_read_input_tokens,
  );

  if (inputTokens || outputTokens || cacheCreationInputTokens || cacheReadInputTokens) {
    return { inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens };
  }

  return {
    inputTokens: positiveInteger(usage.totalTokens ?? usage.total_tokens),
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };
}

export function computeProviderCostEur(
  usage: TokenUsage,
  model: string,
  price: ModelPrice = getModelPrice(model),
): number {
  const normalized = normalizeTokenUsage(usage);
  const uncachedInputTokens = Math.max(
    0,
    normalized.inputTokens - normalized.cacheCreationInputTokens - normalized.cacheReadInputTokens,
  );

  return (
    (uncachedInputTokens / 1_000_000) * price.inputEurPerMillion +
    (normalized.outputTokens / 1_000_000) * price.outputEurPerMillion +
    (normalized.cacheCreationInputTokens / 1_000_000) *
      (price.cacheWriteEurPerMillion ?? price.inputEurPerMillion) +
    (normalized.cacheReadInputTokens / 1_000_000) *
      (price.cacheReadEurPerMillion ?? price.inputEurPerMillion)
  );
}

export function eurToCredits(eur: number): number {
  if (!Number.isFinite(eur) || eur <= 0) return 0;
  return Math.max(1, Math.ceil(eur * CREDITS_PER_EURO));
}

export function usageToCredits(usage: TokenUsage, model: string): number {
  return eurToCredits(computeProviderCostEur(usage, model));
}

