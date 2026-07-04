/**
 * Mistral helper for the harness — used ONLY by the synthetic customer.
 *
 * There is no LLM judge here: judging is done by Claude Code (Opus) itself while
 * it runs the simulation skill (see judge.ts / SKILL.md). So the only model the
 * harness calls is the persona model — the coach is the real /api/chat (also
 * Mistral), and the judge is Claude Code.
 */

import { Mistral } from '@mistralai/mistralai';
import { withRateLimitRetry } from '@/lib/agents/llm';

/** The persona model: a capable model makes a more realistic, less robotic customer. */
export const PERSONA_MODEL =
  process.env.SIM_PERSONA_MODEL?.trim() || 'mistral-large-latest';

export type TextComplete = (args: {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  model?: string;
}) => Promise<string>;

let client: Mistral | null = null;
function mistral(): Mistral {
  if (!client) client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY || '' });
  return client;
}

/** Free-text completion (used for the persona's replies). */
export const completeText: TextComplete = async ({ system, messages, model }) => {
  const res = await withRateLimitRetry(() =>
    mistral().chat.complete({
      model: model || PERSONA_MODEL,
      messages: [{ role: 'system', content: system }, ...messages],
      temperature: 0.8,
    }),
  );
  const raw = res.choices?.[0]?.message?.content;
  return typeof raw === 'string' ? raw : '';
};
