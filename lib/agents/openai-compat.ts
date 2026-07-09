/**
 * OpenAI Chat-Completions ↔ Mistral SDK Format-Mapping — für die openAiApi-kompatiblen
 * Proxy-Routen unter /api/agent/v1/*. n8n's `lmChatOpenAi`-Sub-Node (via LangChain
 * ChatOpenAI) spricht Standard-OpenAI-Format; unser Backend ist Mistral.
 *
 * Wichtig: `function.arguments` ist in BEIDEN Formaten ein JSON-STRING (kein Objekt) —
 * einfach durchreichen, nie parsen/re-serialisieren (Rundreise-Treue).
 */

import type { ProxyChatMessage, ProxyUsage } from './model-proxy';

// ── Modelle ──────────────────────────────────────────────────────────────────

/** Von n8n anfragbare Modell-IDs → echte Mistral-Modelle. */
const ALLOWED_MODELS = ['mistral-small-latest', 'mistral-medium-latest'] as const;
export type AllowedModel = (typeof ALLOWED_MODELS)[number];

/** Default, falls n8n kein Modell schickt oder ein unbekanntes (z.B. "gpt-4o-mini"). */
export function defaultOpenAiCompatModel(): AllowedModel {
  const envModel = process.env.MISTRAL_CHAT_MODEL?.trim();
  return (ALLOWED_MODELS as readonly string[]).includes(envModel ?? '')
    ? (envModel as AllowedModel)
    : 'mistral-small-latest';
}

/** Mappt eine angefragte Modell-ID auf ein erlaubtes Mistral-Modell (nie einen Fehler werfen). */
export function resolveRequestedModel(requested: string | undefined | null): AllowedModel {
  const trimmed = requested?.trim();
  if (trimmed && (ALLOWED_MODELS as readonly string[]).includes(trimmed)) return trimmed as AllowedModel;
  return defaultOpenAiCompatModel();
}

export function listAllowedModels(): readonly string[] {
  return ALLOWED_MODELS;
}

// ── Request-Mapping: OpenAI → Mistral ───────────────────────────────────────

export type OpenAiToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type OpenAiChatCompletionRequest = {
  model?: string;
  messages: OpenAiMessage[];
  tools?: unknown[];
  tool_choice?: unknown;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
};

/** Ein OpenAI-Message → Mistral-Message (camelCase toolCalls/toolCallId). */
export function toMistralMessage(msg: OpenAiMessage): ProxyChatMessage {
  const base: ProxyChatMessage = {
    role: msg.role,
    content: typeof msg.content === 'string' ? msg.content : '',
  };
  if (msg.tool_calls?.length) {
    base.toolCalls = msg.tool_calls.map(tc => ({
      id: tc.id,
      type: 'function' as const,
      // arguments bleibt der rohe JSON-String — Mistral erwartet exakt dasselbe Format.
      function: { name: tc.function.name, arguments: tc.function.arguments },
    }));
  }
  if (msg.tool_call_id) base.toolCallId = msg.tool_call_id;
  if (msg.name) base.name = msg.name;
  return base;
}

export function toMistralMessages(messages: OpenAiMessage[]): ProxyChatMessage[] {
  return messages.map(toMistralMessage);
}

/** OpenAI tool_choice ("auto"/"none"/{type:"function",...}) → Mistral toolChoice (nur der einfache Fall). */
export function toMistralToolChoice(toolChoice: unknown): string | undefined {
  if (typeof toolChoice === 'string') return toolChoice;
  if (toolChoice && typeof toolChoice === 'object') return 'any';
  return undefined;
}

// ── Response-Mapping: Mistral → OpenAI ──────────────────────────────────────

export type OpenAiToolCallDelta = OpenAiToolCall;

export type OpenAiAssistantMessage = {
  role: 'assistant';
  content: string | null;
  tool_calls?: OpenAiToolCallDelta[];
};

export type OpenAiFinishReason = 'stop' | 'tool_calls' | 'length' | 'content_filter';

/** Extrahiert die Mistral-toolCalls (unknown, aus completeChat) in OpenAI-Shape. */
export function toolCallsToOpenAi(toolCalls: unknown): OpenAiToolCallDelta[] | undefined {
  if (!Array.isArray(toolCalls) || !toolCalls.length) return undefined;
  const out: OpenAiToolCallDelta[] = [];
  for (const tc of toolCalls) {
    const t = tc as { id?: string; function?: { name?: string; arguments?: string } };
    if (!t.function?.name) continue;
    out.push({
      id: t.id || `call_${Math.random().toString(36).slice(2, 10)}`,
      type: 'function',
      function: { name: t.function.name, arguments: t.function.arguments ?? '{}' },
    });
  }
  return out.length ? out : undefined;
}

export function mistralFinishReasonToOpenAi(
  hasToolCalls: boolean,
  mistralFinishReason?: string | null,
): OpenAiFinishReason {
  if (hasToolCalls) return 'tool_calls';
  if (mistralFinishReason === 'length') return 'length';
  if (mistralFinishReason === 'content_filter' || mistralFinishReason === 'moderation') return 'content_filter';
  return 'stop';
}

export type OpenAiUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export function usageToOpenAi(usage: ProxyUsage): OpenAiUsage {
  return {
    prompt_tokens: usage.promptTokens ?? 0,
    completion_tokens: usage.completionTokens ?? 0,
    total_tokens: usage.totalTokens ?? (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0),
  };
}

export function newCompletionId(): string {
  return `chatcmpl-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

export type OpenAiChatCompletionResponse = {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: 0;
    message: OpenAiAssistantMessage;
    finish_reason: OpenAiFinishReason;
  }>;
  usage: OpenAiUsage;
};

export function buildOpenAiCompletionResponse(args: {
  model: string;
  content: string;
  toolCalls: unknown;
  usage: ProxyUsage;
}): OpenAiChatCompletionResponse {
  const openAiToolCalls = toolCallsToOpenAi(args.toolCalls);
  return {
    id: newCompletionId(),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: args.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: args.content || (openAiToolCalls ? null : ''),
          ...(openAiToolCalls ? { tool_calls: openAiToolCalls } : {}),
        },
        finish_reason: mistralFinishReasonToOpenAi(!!openAiToolCalls),
      },
    ],
    usage: usageToOpenAi(args.usage),
  };
}

// ── OpenAI-Fehlerformat ──────────────────────────────────────────────────────

export type OpenAiErrorType = 'invalid_request_error' | 'insufficient_quota' | 'api_error' | 'authentication_error';

export function openAiError(message: string, type: OpenAiErrorType, code?: string): {
  error: { message: string; type: OpenAiErrorType; code: string | null };
} {
  return { error: { message, type, code: code ?? null } };
}
