/**
 * Statische Dropdown-Optionen für n8n-Properties, die loadOptions nutzen
 * (Mistral/OpenAI Modelle etc.) — Klaro kann n8n-interne loadOptions nicht ausführen.
 */

import type { N8nPropertyOption } from './n8n-catalog-types';

type Opt = { name: string; value: string };

const MISTRAL_CHAT_MODELS: Opt[] = [
  { name: 'Mistral Large 3 (stark)', value: 'mistral-large-latest' },
  { name: 'Mistral Small (günstig)', value: 'mistral-small-latest' },
  { name: 'Mistral Small (n8n-Default)', value: 'mistral-small' },
  { name: 'Mistral Medium', value: 'mistral-medium-latest' },
  { name: 'Codestral', value: 'codestral-latest' },
  { name: 'Open Mistral 7B', value: 'open-mistral-7b' },
];

const OPENAI_CHAT_MODELS: Opt[] = [
  { name: 'GPT-4o', value: 'gpt-4o' },
  { name: 'GPT-4o mini (günstig)', value: 'gpt-4o-mini' },
  { name: 'GPT-4.1', value: 'gpt-4.1' },
  { name: 'GPT-4.1 mini', value: 'gpt-4.1-mini' },
  { name: 'o3-mini', value: 'o3-mini' },
];

const GEMINI_CHAT_MODELS: Opt[] = [
  { name: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
  { name: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' },
  { name: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' },
];

const ANTHROPIC_CHAT_MODELS: Opt[] = [
  { name: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514' },
  { name: 'Claude 3.5 Haiku', value: 'claude-3-5-haiku-20241022' },
];

/** nodeType → propertyName → Optionen */
const BY_NODE: Record<string, Record<string, Opt[]>> = {
  '@n8n/n8n-nodes-langchain.lmChatMistralCloud': { model: MISTRAL_CHAT_MODELS },
  '@n8n/n8n-nodes-langchain.lmChatOpenAi': { model: OPENAI_CHAT_MODELS },
  '@n8n/n8n-nodes-langchain.lmChatGoogleGemini': { model: GEMINI_CHAT_MODELS },
  '@n8n/n8n-nodes-langchain.lmChatAnthropic': { model: ANTHROPIC_CHAT_MODELS },
  '@n8n/n8n-nodes-langchain.openAi': {
    resource: [
      { name: 'Text', value: 'text' },
      { name: 'Image', value: 'image' },
      { name: 'Audio', value: 'audio' },
    ],
    operation: [
      { name: 'Message a Model', value: 'message' },
      { name: 'Classify Text', value: 'classify' },
    ],
  },
};

/** Property-Name → generische Fallbacks (wenn Node nicht exakt gemappt). */
const BY_PROPERTY: Record<string, Opt[]> = {
  model: MISTRAL_CHAT_MODELS,
};

function toN8nOptions(opts: Opt[]): N8nPropertyOption[] {
  return opts.map(o => ({ name: o.name, value: o.value }));
}

/** Eindeutige value-Keys — Mistral-API liefert teils doppelte Model-IDs. */
export function dedupePropertyOptions(options: N8nPropertyOption[]): N8nPropertyOption[] {
  const seen = new Set<string>();
  const out: N8nPropertyOption[] = [];
  for (const o of options) {
    const key = String(o.value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

export function hasLoadOptions(prop: { type?: string; options?: unknown[]; typeOptions?: Record<string, unknown> }): boolean {
  if (prop.type !== 'options' && prop.type !== 'multiOptions') return false;
  if (prop.options && prop.options.length > 0) return false;
  const to = prop.typeOptions;
  return !!(to?.loadOptions || to?.loadOptionsMethod || to?.loadOptionsDependsOn);
}

export function resolveStaticOptions(
  nodeType: string,
  propertyName: string,
): N8nPropertyOption[] {
  const exact = BY_NODE[nodeType]?.[propertyName];
  if (exact?.length) return dedupePropertyOptions(toN8nOptions(exact));

  // lmChat* Pattern
  if (propertyName === 'model' && /lmChat/i.test(nodeType)) {
    if (/mistral/i.test(nodeType)) return dedupePropertyOptions(toN8nOptions(MISTRAL_CHAT_MODELS));
    if (/openai|openAi/i.test(nodeType)) return dedupePropertyOptions(toN8nOptions(OPENAI_CHAT_MODELS));
    if (/gemini|google/i.test(nodeType)) return dedupePropertyOptions(toN8nOptions(GEMINI_CHAT_MODELS));
    if (/anthropic/i.test(nodeType)) return dedupePropertyOptions(toN8nOptions(ANTHROPIC_CHAT_MODELS));
  }

  const generic = BY_PROPERTY[propertyName];
  if (generic?.length) return dedupePropertyOptions(toN8nOptions(generic));

  return [];
}
