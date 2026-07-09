/**
 * Tests für die OpenAI ↔ Mistral Format-Mapping (lib/agents/openai-compat.ts) —
 * das Rückgrat der openAiApi-kompatiblen Proxy-Routen unter /api/agent/v1/*.
 */
import { describe, it, expect } from 'vitest';
import {
  buildOpenAiCompletionResponse,
  defaultOpenAiCompatModel,
  listAllowedModels,
  mistralFinishReasonToOpenAi,
  openAiError,
  resolveRequestedModel,
  toMistralMessage,
  toMistralMessages,
  toMistralToolChoice,
  toolCallsToOpenAi,
  usageToOpenAi,
  type OpenAiMessage,
} from '@/lib/agents/openai-compat';

describe('resolveRequestedModel', () => {
  it('passes through an allowed model', () => {
    expect(resolveRequestedModel('mistral-small-latest')).toBe('mistral-small-latest');
    expect(resolveRequestedModel('mistral-medium-latest')).toBe('mistral-medium-latest');
  });

  it('falls back to the default for unknown model ids (n8n default gpt-4o-mini)', () => {
    expect(resolveRequestedModel('gpt-4o-mini')).toBe(defaultOpenAiCompatModel());
    expect(resolveRequestedModel(undefined)).toBe(defaultOpenAiCompatModel());
    expect(resolveRequestedModel('')).toBe(defaultOpenAiCompatModel());
  });

  it('never throws on garbage input', () => {
    expect(() => resolveRequestedModel('; DROP TABLE users;--')).not.toThrow();
  });
});

describe('listAllowedModels', () => {
  it('only exposes the two allowed Mistral models', () => {
    expect(listAllowedModels()).toEqual(['mistral-small-latest', 'mistral-medium-latest']);
  });
});

describe('toMistralMessage / toMistralMessages — round trip', () => {
  it('maps a plain user/assistant/system exchange', () => {
    const messages: OpenAiMessage[] = [
      { role: 'system', content: 'Du bist hilfreich.' },
      { role: 'user', content: 'Hallo' },
      { role: 'assistant', content: 'Hi!' },
    ];
    const mapped = toMistralMessages(messages);
    expect(mapped).toEqual([
      { role: 'system', content: 'Du bist hilfreich.' },
      { role: 'user', content: 'Hallo' },
      { role: 'assistant', content: 'Hi!' },
    ]);
  });

  it('maps tool_calls (snake_case) to toolCalls (camelCase), preserving arguments as a raw string', () => {
    const msg: OpenAiMessage = {
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'search_knowledge', arguments: '{"query":"gmail"}' } },
      ],
    };
    const mapped = toMistralMessage(msg);
    expect(mapped.toolCalls).toEqual([
      { id: 'call_1', type: 'function', function: { name: 'search_knowledge', arguments: '{"query":"gmail"}' } },
    ]);
    // arguments bleibt exakt der String — nie geparst/re-serialisiert.
    const tc = (mapped.toolCalls as Array<{ function: { arguments: string } }>)[0];
    expect(typeof tc.function.arguments).toBe('string');
  });

  it('maps a tool-role message with tool_call_id', () => {
    const msg: OpenAiMessage = { role: 'tool', content: '{"result":42}', tool_call_id: 'call_1', name: 'search_knowledge' };
    const mapped = toMistralMessage(msg);
    expect(mapped.role).toBe('tool');
    expect(mapped.toolCallId).toBe('call_1');
    expect(mapped.name).toBe('search_knowledge');
    expect(mapped.content).toBe('{"result":42}');
  });

  it('treats a null/missing content as an empty string', () => {
    const mapped = toMistralMessage({ role: 'assistant', content: null });
    expect(mapped.content).toBe('');
  });
});

describe('toMistralToolChoice', () => {
  it('passes through string choices', () => {
    expect(toMistralToolChoice('auto')).toBe('auto');
    expect(toMistralToolChoice('none')).toBe('none');
  });

  it('maps an OpenAI forced-function object to "any"', () => {
    expect(toMistralToolChoice({ type: 'function', function: { name: 'x' } })).toBe('any');
  });

  it('returns undefined when absent', () => {
    expect(toMistralToolChoice(undefined)).toBeUndefined();
  });
});

describe('toolCallsToOpenAi', () => {
  it('maps Mistral toolCalls to OpenAI tool_calls', () => {
    const out = toolCallsToOpenAi([
      { id: 'call_9', function: { name: 'web_search', arguments: '{"q":"n8n"}' } },
    ]);
    expect(out).toEqual([
      { id: 'call_9', type: 'function', function: { name: 'web_search', arguments: '{"q":"n8n"}' } },
    ]);
  });

  it('returns undefined for empty/absent tool calls', () => {
    expect(toolCallsToOpenAi(null)).toBeUndefined();
    expect(toolCallsToOpenAi([])).toBeUndefined();
  });

  it('generates a call id when Mistral omits one', () => {
    const out = toolCallsToOpenAi([{ function: { name: 'x', arguments: '{}' } }]);
    expect(out?.[0].id).toBeTruthy();
  });
});

describe('mistralFinishReasonToOpenAi', () => {
  it('maps tool calls presence to "tool_calls" regardless of the raw reason', () => {
    expect(mistralFinishReasonToOpenAi(true, 'stop')).toBe('tool_calls');
  });
  it('maps "length" through', () => {
    expect(mistralFinishReasonToOpenAi(false, 'length')).toBe('length');
  });
  it('defaults to "stop"', () => {
    expect(mistralFinishReasonToOpenAi(false, undefined)).toBe('stop');
    expect(mistralFinishReasonToOpenAi(false, 'stop')).toBe('stop');
  });
});

describe('usageToOpenAi', () => {
  it('maps promptTokens/completionTokens/totalTokens to snake_case', () => {
    expect(usageToOpenAi({ promptTokens: 10, completionTokens: 5, totalTokens: 15 })).toEqual({
      prompt_tokens: 10, completion_tokens: 5, total_tokens: 15,
    });
  });
  it('derives total_tokens when missing', () => {
    expect(usageToOpenAi({ promptTokens: 10, completionTokens: 5, totalTokens: null })).toEqual({
      prompt_tokens: 10, completion_tokens: 5, total_tokens: 15,
    });
  });
});

describe('buildOpenAiCompletionResponse', () => {
  it('builds a standard OpenAI chat.completion shape for a plain text answer', () => {
    const res = buildOpenAiCompletionResponse({
      model: 'mistral-small-latest',
      content: 'Hallo!',
      toolCalls: null,
      usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
    });
    expect(res.object).toBe('chat.completion');
    expect(res.model).toBe('mistral-small-latest');
    expect(res.choices).toHaveLength(1);
    expect(res.choices[0].message).toEqual({ role: 'assistant', content: 'Hallo!' });
    expect(res.choices[0].finish_reason).toBe('stop');
    expect(res.usage).toEqual({ prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 });
  });

  it('sets finish_reason=tool_calls and includes tool_calls when present', () => {
    const res = buildOpenAiCompletionResponse({
      model: 'mistral-small-latest',
      content: '',
      toolCalls: [{ id: 'call_1', function: { name: 'search_knowledge', arguments: '{}' } }],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
    expect(res.choices[0].finish_reason).toBe('tool_calls');
    expect(res.choices[0].message.tool_calls).toEqual([
      { id: 'call_1', type: 'function', function: { name: 'search_knowledge', arguments: '{}' } },
    ]);
    expect(res.choices[0].message.content).toBeNull();
  });
});

describe('openAiError', () => {
  it('wraps a message in the OpenAI error envelope', () => {
    expect(openAiError('nope', 'invalid_request_error')).toEqual({
      error: { message: 'nope', type: 'invalid_request_error', code: null },
    });
  });
  it('includes an optional code', () => {
    expect(openAiError('no credits', 'insufficient_quota', 'INSUFFICIENT_CREDITS').error.code).toBe(
      'INSUFFICIENT_CREDITS',
    );
  });
});
