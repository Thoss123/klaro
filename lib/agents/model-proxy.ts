/**
 * Geteilte Logik für den gemeterten Mistral-Chat-Proxy — das Modell hinter der
 * „Axantilo Chat Model"-n8n-Node (sowohl das Axantilo-eigene `/api/agent/model`-Format
 * als auch die OpenAI-kompatiblen `/api/agent/v1/*`-Routen nutzen diesen Kern).
 *
 * Verantwortlichkeiten: Mistral-Call (inkl. Rate-Limit-Retry), Credit-Check + Abbuchung.
 * Der Mistral-Key bleibt server-only; n8n sieht ihn nie.
 */

import { Mistral } from '@mistralai/mistralai';
import { withRateLimitRetry } from '@/lib/agents/llm';
import { canAfford, debitFromUsage } from '@/lib/billing/credits';

export type ProxyChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: unknown;
  toolCallId?: string;
  name?: string;
};

export type ProxyUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type ProxyAssistantMessage = {
  role: 'assistant';
  content: string;
  toolCalls: unknown;
};

export type CompleteChatInput = {
  userId: string;
  projectId: string;
  messages: ProxyChatMessage[];
  model?: string;
  tools?: unknown[];
  toolChoice?: string;
  action?: string;
};

export type CompleteChatResult =
  | { ok: true; message: ProxyAssistantMessage; model: string; usage: ProxyUsage }
  | { ok: false; status: number; error: string };

let mistralClient: Mistral | null = null;

/** Lazily erstellter, gecachter Mistral-Client (Key bleibt server-only). */
export function getMistralClient(): Mistral | null {
  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) return null;
  if (!mistralClient) mistralClient = new Mistral({ apiKey });
  return mistralClient;
}

/** Default-Modell für /api/agent/model, falls der Aufrufer keins angibt. */
export function defaultChatModel(): string {
  return process.env.MISTRAL_CHAT_MODEL || 'mistral-medium-latest';
}

/**
 * Führt EINE Chat-Runde gegen Mistral aus: Credit-Check, Aufruf (mit Rate-Limit-Retry),
 * Abbuchung. Stateless — der Aufrufer (n8n-Agent-Loop) übergibt die volle Message-History
 * pro Runde und bekommt die Assistant-Antwort inkl. optionaler tool_calls zurück.
 */
export async function completeChat(input: CompleteChatInput): Promise<CompleteChatResult> {
  if (!input.messages.length) {
    return { ok: false, status: 400, error: 'messages[] required' };
  }

  const affordability = await canAfford(input.userId, 1);
  if (!affordability.ok) {
    return { ok: false, status: 402, error: 'INSUFFICIENT_CREDITS' };
  }

  const client = getMistralClient();
  if (!client) {
    return { ok: false, status: 500, error: 'MISTRAL_API_KEY not configured' };
  }
  const chatModel = input.model?.trim() || defaultChatModel();

  try {
    const res = await withRateLimitRetry(() =>
      client.chat.complete({
        model: chatModel,
        messages: input.messages as never,
        ...(Array.isArray(input.tools) && input.tools.length
          ? { tools: input.tools as never, toolChoice: (input.toolChoice ?? 'auto') as never }
          : {}),
      }),
    );

    const choice = res.choices?.[0]?.message;
    const usage: ProxyUsage = {
      promptTokens: res.usage?.promptTokens ?? null,
      completionTokens: res.usage?.completionTokens ?? null,
      totalTokens: res.usage?.totalTokens ?? null,
    };

    await debitFromUsage({
      userId: input.userId,
      usage,
      model: chatModel,
      action: input.action ?? 'agent_model',
      projectId: input.projectId,
      metadata: { rounds: 1 },
    }).catch((e) => console.warn('[model-proxy] debit failed:', e instanceof Error ? e.message : String(e)));

    return {
      ok: true,
      message: {
        role: 'assistant',
        content: typeof choice?.content === 'string' ? choice.content : '',
        toolCalls: choice?.toolCalls ?? null,
      },
      model: chatModel,
      usage,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[model-proxy] failed:', msg);
    return { ok: false, status: 502, error: `model call failed: ${msg}` };
  }
}

/** Credit-Vorabcheck für Aufrufer, die den Call selbst ausführen (z.B. Streaming-Route). */
export async function checkAffordable(userId: string): Promise<boolean> {
  const affordability = await canAfford(userId, 1);
  return affordability.ok;
}

/** Bucht die Credits einer Runde ab — geteilt zwischen non-streaming und SSE-Pfad. */
export async function meterUsage(args: {
  userId: string;
  projectId: string;
  usage: ProxyUsage;
  model: string;
  action?: string;
}): Promise<void> {
  await debitFromUsage({
    userId: args.userId,
    usage: args.usage,
    model: args.model,
    action: args.action ?? 'agent_model',
    projectId: args.projectId,
    metadata: { rounds: 1 },
  }).catch((e) => console.warn('[model-proxy] debit failed:', e instanceof Error ? e.message : String(e)));
}
