export type ModelPrice = {
  inputEurPerMillion: number;
  outputEurPerMillion: number;
  cacheWriteEurPerMillion?: number;
  cacheReadEurPerMillion?: number;
};

const ANTHROPIC_HAIKU_45: ModelPrice = {
  inputEurPerMillion: 1,
  outputEurPerMillion: 5,
  cacheWriteEurPerMillion: 1.25,
  cacheReadEurPerMillion: 0.1,
};

const ANTHROPIC_SONNET_5_INTRO: ModelPrice = {
  // Sonnet 5 introductory API pricing through 2026-08-31.
  inputEurPerMillion: 2,
  outputEurPerMillion: 10,
  cacheWriteEurPerMillion: 2.5,
  cacheReadEurPerMillion: 0.2,
};

const ANTHROPIC_SONNET_STANDARD: ModelPrice = {
  inputEurPerMillion: 3,
  outputEurPerMillion: 15,
  cacheWriteEurPerMillion: 3.75,
  cacheReadEurPerMillion: 0.3,
};

const MISTRAL_SMALL: ModelPrice = {
  inputEurPerMillion: 0.1,
  outputEurPerMillion: 0.3,
};

const VOXTRAL_MINI: ModelPrice = {
  inputEurPerMillion: 0.1,
  outputEurPerMillion: 0.1,
};

const MISTRAL_MEDIUM: ModelPrice = {
  inputEurPerMillion: 0.4,
  outputEurPerMillion: 2,
};

const MISTRAL_LARGE: ModelPrice = {
  inputEurPerMillion: 2,
  outputEurPerMillion: 6,
};

const MODEL_PRICES: Array<[RegExp, ModelPrice]> = [
  [/claude-haiku-4-5/i, ANTHROPIC_HAIKU_45],
  [/claude-sonnet-5/i, ANTHROPIC_SONNET_5_INTRO],
  [/claude-sonnet/i, ANTHROPIC_SONNET_STANDARD],
  [/mistral-small/i, MISTRAL_SMALL],
  [/mistral-medium/i, MISTRAL_MEDIUM],
  [/mistral-large/i, MISTRAL_LARGE],
  [/voxtral-mini/i, VOXTRAL_MINI],
];

export function getModelPrice(model: string): ModelPrice {
  const matched = MODEL_PRICES.find(([pattern]) => pattern.test(model));
  return matched?.[1] ?? ANTHROPIC_HAIKU_45;
}

