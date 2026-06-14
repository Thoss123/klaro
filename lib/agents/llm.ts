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

/** True wenn der Fehler ein Rate-Limit (HTTP 429) der Mistral-API ist. */
function isRateLimitError(e: unknown): boolean {
  const status = (e as { statusCode?: number; status?: number })?.statusCode
    ?? (e as { status?: number })?.status;
  if (status === 429) return true;
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return /status\s*429|rate.?limit/i.test(msg);
}

/**
 * Führt `fn` aus und wiederholt bei 429 (Rate-Limit) mit Backoff —
 * Mistral free/low tiers drosseln schnell; ein Retry rettet den Canvas-Sync
 * statt ihn als „Canvas-Fehler (429)" abbrechen zu lassen.
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  { retries = 3, baseDelayMs = 2000 }: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isRateLimitError(e) || attempt === retries) throw e;
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[llm] 429 rate limit — retry ${attempt + 1}/${retries} in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/** Build a `CompleteJson` backed by a real Mistral client (JSON response mode). */
export function mistralCompleteJson(client: Mistral, model: string = AGENT_MODEL): CompleteJson {
  return async ({ system, user }) => {
    const res = await withRateLimitRetry(() => client.chat.complete({
      model: model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      responseFormat: { type: 'json_object' },
    }));
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
