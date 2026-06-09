/**
 * Thin Mistral-Small helper shared by the orchestration agents.
 *
 * Kept tiny and dependency-injectable so agent logic can be unit-tested
 * without any network access (pass a fake `complete`).
 */

import { Mistral } from '@mistralai/mistralai';

export const AGENT_MODEL = 'mistral-small-latest';

/** Function shape the agents depend on — real impl wraps Mistral, tests inject a fake. */
export type CompleteJson = (args: {
  system: string;
  user: string;
}) => Promise<{ content: string; tokens: number }>;

/** Build a `CompleteJson` backed by a real Mistral client (JSON response mode). */
export function mistralCompleteJson(client: Mistral, model: string = AGENT_MODEL): CompleteJson {
  return async ({ system, user }) => {
    const res = await client.chat.complete({
      model: model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      responseFormat: { type: 'json_object' },
    });
    const raw = res.choices?.[0]?.message?.content;
    const content = typeof raw === 'string' ? raw : '';
    const tokens = res.usage?.totalTokens ?? estimateTokens(system + user + content);
    return { content, tokens };
  };
}

/** Rough token estimate (~4 chars/token) for cost logging when usage is absent. */
export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}

/** Strip ```json fences and parse; returns null on any failure (never throws). */
export function safeParseJson<T = Record<string, unknown>>(raw: string): T | null {
  if (!raw) return null;
  try {
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

/** Coerce an unknown LLM value to a clean string[] (drops empties). */
export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(v => (typeof v === 'string' ? v.trim() : String(v ?? '').trim())).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}
