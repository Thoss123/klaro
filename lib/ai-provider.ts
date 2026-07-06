import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlockParam, MessageParam, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages/messages';
import {
  GoogleGenerativeAI,
  type ChatSession,
  type GenerateContentStreamResult,
} from '@google/generative-ai';
import { Mistral } from '@mistralai/mistralai';
import { toAnthropicTools, toGeminiTools, toMistralTools, getToolsForPhase } from './ai-tools';
import { stripLeakedToolFragments } from './strip-internal-tags';
import type { TokenUsage } from '@/lib/billing/token-cost';

/** Handler invoked when the model requests a tool call. */
type ToolCallHandler = (
  toolCall: { name: string; args: Record<string, unknown> },
) => Promise<unknown>;

/** Loose message shape we build for the Mistral chat API (cast at the call site). */
type ChatMessage = {
  role: string;
  content?: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; imageUrl: string }>;
  name?: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
};

type MistralPendingToolCall = {
  id: string;
  name: string;
  arguments: string;
};

function mergeMistralToolCallDelta(
  pending: Map<number, MistralPendingToolCall>,
  call: {
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  },
) {
  const idx = call.index ?? 0;
  const entry = pending.get(idx) ?? { id: call.id ?? '', name: '', arguments: '' };
  if (call.id) entry.id = call.id;
  if (call.function?.name) entry.name = call.function.name;
  if (call.function?.arguments) entry.arguments += call.function.arguments;
  pending.set(idx, entry);
}

export type VisionAttachment = { mimeType: string; base64: string };

export type AIUsageResult = {
  model: string;
  usage: TokenUsage;
};

function addUsage(total: TokenUsage, next: TokenUsage | undefined | null) {
  if (!next) return;
  total.inputTokens = (total.inputTokens ?? 0) + (next.inputTokens ?? next.input_tokens ?? next.promptTokens ?? next.prompt_tokens ?? 0);
  total.outputTokens = (total.outputTokens ?? 0) + (next.outputTokens ?? next.output_tokens ?? next.completionTokens ?? next.completion_tokens ?? 0);
  total.cacheCreationInputTokens =
    (total.cacheCreationInputTokens ?? 0) + (next.cacheCreationInputTokens ?? next.cache_creation_input_tokens ?? 0);
  total.cacheReadInputTokens =
    (total.cacheReadInputTokens ?? 0) + (next.cacheReadInputTokens ?? next.cache_read_input_tokens ?? 0);
}

// Control marker: tells the client to discard the coach text streamed so far in
// this turn. Emitted when a round streamed (premature) text live and then ended
// in tool calls — the model re-answers after the results, so the live text must
// be wiped before the final answer streams. Already-fired tag side effects stay.
function buildMistralUserContent(message: string, attachments?: VisionAttachment[]) {
  const images = (attachments || []).filter(a => a.mimeType?.startsWith('image/') && a.base64);
  if (!images.length) return message || ' ';

  const parts: Array<{ type: 'text'; text: string } | { type: 'image_url'; imageUrl: string }> = [];
  if (message.trim()) parts.push({ type: 'text', text: message });
  for (const img of images) {
    parts.push({
      type: 'image_url',
      imageUrl: `data:${img.mimeType};base64,${img.base64}`,
    });
  }
  if (!parts.length) parts.push({ type: 'text', text: ' ' });
  return parts;
}

export interface AIProvider {
  streamMessage(
    systemPrompt: string,
    history: { role: string, content: string }[],
    message: string,
    onChunk: (chunk: string) => void,
    onToolCall?: ToolCallHandler,
    attachments?: VisionAttachment[],
    phase?: string
  ): Promise<AIUsageResult>;
}

export class GeminiProvider implements AIProvider {
  private genAI: GoogleGenerativeAI;
  
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  }

  private userParts(message: string, attachments?: VisionAttachment[]) {
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    for (const a of attachments || []) {
      if (a.mimeType?.startsWith('image/') && a.base64) {
        parts.push({ inlineData: { mimeType: a.mimeType, data: a.base64 } });
      }
    }
    parts.push({ text: message || ' ' });
    return parts;
  }
  
  async streamMessage(
    systemPrompt: string,
    history: { role: string, content: string }[],
    message: string,
    onChunk: (chunk: string) => void,
    onToolCall?: ToolCallHandler,
    attachments?: VisionAttachment[],
    phase?: string
  ) {
    const usage: TokenUsage = {};
    let modelName = 'gemini-3.5-flash';
    const setGeminiUsage = (metadata: unknown) => {
      const m = metadata as {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      } | null | undefined;
      if (!m) return;
      usage.inputTokens = Math.max(usage.inputTokens ?? 0, m.promptTokenCount ?? 0);
      usage.outputTokens = Math.max(usage.outputTokens ?? 0, m.candidatesTokenCount ?? 0);
      usage.totalTokens = Math.max(usage.totalTokens ?? 0, m.totalTokenCount ?? 0);
    };

    const tools = getToolsForPhase(phase || 'diagnose');
    const geminiHistory = history.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content || ' ' }]
    }));
    
    // Ensure history starts with 'user' if it exists and alternates
    const normalizedHistory: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    if (geminiHistory.length > 0 && geminiHistory[0].role === 'model') {
      normalizedHistory.push({ role: 'user', parts: [{ text: 'Hallo, lass uns starten!' }] });
    }
    for (const msg of geminiHistory) {
      if (normalizedHistory.length === 0) {
        if (msg.role === 'user') normalizedHistory.push(msg);
        continue;
      }
      const lastMsg = normalizedHistory[normalizedHistory.length - 1];
      if (lastMsg.role === msg.role) {
        lastMsg.parts[0].text += '\n\n' + msg.parts[0].text;
      } else {
        normalizedHistory.push(msg);
      }
    }

    const model = this.genAI.getGenerativeModel({ 
      model: modelName,
      systemInstruction: systemPrompt,
      tools: [{ functionDeclarations: toGeminiTools(tools) }]
    });

    const chat = model.startChat({ history: normalizedHistory });
    
    // Text wird pro Runde gepuffert: Endet eine Runde in Tool-Calls, verwerfen wir
    // den Puffer (der voreilige Text erscheint gar nicht erst) — nur die finale,
    // tool-freie Runde wird ausgegeben. Kein Live-Flackern, keine Doppel-Nachrichten.
    const processStream = async (res: GenerateContentStreamResult, currentChat: ChatSession) => {
      let roundBuffer = '';
      for await (const chunk of res.stream) {
         const usageMetadata = (chunk as unknown as { usageMetadata?: unknown; response?: { usageMetadata?: unknown } });
         setGeminiUsage(usageMetadata.usageMetadata ?? usageMetadata.response?.usageMetadata);
         const chunkText = chunk.text();
         if (chunkText) roundBuffer += chunkText;

         const calls = chunk.functionCalls();
         if (calls && calls.length > 0 && onToolCall) {
            // Tool-Runde: gepufferten Text verwerfen — nichts live zeigen, kein Reset-Flackern.
            roundBuffer = '';
            for (const call of calls) {
               // Execute the tool call
               let toolResult;
               try {
                  toolResult = await onToolCall({ name: call.name, args: (call.args ?? {}) as Record<string, unknown> });
               } catch (e: unknown) {
                  toolResult = { error: e instanceof Error ? e.message : String(e) };
               }

               // Send the result back to Gemini and continue streaming
               const nextResult = await currentChat.sendMessageStream([{
                  functionResponse: {
                     name: call.name,
                     response: (toolResult ?? {}) as object,
                  }
               }]);

               await processStream(nextResult, currentChat);
            }
            return;
         }
      }
      if (roundBuffer) onChunk(roundBuffer);
    };
    
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
        const result = await chat.sendMessageStream(this.userParts(message, attachments));
        await processStream(result, chat);
    } catch (error: unknown) {
        console.warn('Primary model failed in AIProvider:', error instanceof Error ? error.message : String(error));
        console.log('Waiting 2 seconds before retrying due to potential rate limits...');
        await sleep(2000);
        
        try {
            // Retry with primary model first
            const retryChat = model.startChat({ history: normalizedHistory });
            const retryResult = await retryChat.sendMessageStream(this.userParts(message, attachments));
            await processStream(retryResult, retryChat);
        } catch (retryError: unknown) {
            console.warn('Retry failed:', retryError instanceof Error ? retryError.message : String(retryError));
            console.log('Falling back to gemini-3.1-flash-lite...');
            const fallbackModel = this.genAI.getGenerativeModel({
               model: "gemini-3.1-flash-lite",
               systemInstruction: systemPrompt,
               tools: [{ functionDeclarations: toGeminiTools(tools) }]
            });
            modelName = 'gemini-3.1-flash-lite';
            const fallbackChat = fallbackModel.startChat({ history: normalizedHistory });
            const fallbackResult = await fallbackChat.sendMessageStream(this.userParts(message, attachments));
            await processStream(fallbackResult, fallbackChat);
        }
    }
    return { model: modelName, usage };
  }
}

const ANTHROPIC_CHAT_MODEL = process.env.ANTHROPIC_CHAT_MODEL || 'claude-sonnet-5';
const ANTHROPIC_HAIKU_MODEL =
  process.env.ANTHROPIC_HAIKU_MODEL || 'claude-haiku-4-5';

function resolveAnthropicChatModel(phase?: string): string {
  const p = phase || 'diagnose';
  if (p === 'diagnose') {
    return process.env.ANTHROPIC_DIAGNOSE_MODEL || ANTHROPIC_HAIKU_MODEL;
  }
  if (p === 'analyse' || p === 'plan') {
    return process.env.ANTHROPIC_ANALYSE_MODEL || ANTHROPIC_CHAT_MODEL;
  }
  return ANTHROPIC_CHAT_MODEL;
}
const ANTHROPIC_PROMPT_CACHE_TTL: '5m' | '1h' =
  process.env.ANTHROPIC_PROMPT_CACHE_TTL === '5m' ? '5m' : '1h';
const ANTHROPIC_CACHE_CONTROL = { type: 'ephemeral' as const, ttl: ANTHROPIC_PROMPT_CACHE_TTL };

function buildAnthropicCachedSystem(systemPrompt: string) {
  return [
    {
      type: 'text' as const,
      text: systemPrompt,
      cache_control: ANTHROPIC_CACHE_CONTROL,
    },
  ];
}

function buildAnthropicCachedTools(tools: ReturnType<typeof toAnthropicTools>) {
  if (!tools.length) return tools;
  return tools.map((tool, index) =>
    index === tools.length - 1 ? { ...tool, cache_control: ANTHROPIC_CACHE_CONTROL } : tool,
  );
}

function logAnthropicCacheUsage(label: string, usage: { cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null } | undefined) {
  const created = usage?.cache_creation_input_tokens ?? 0;
  const read = usage?.cache_read_input_tokens ?? 0;
  if (created || read) {
    console.log(`[Anthropic][${label}] cache created=${created} read=${read}`);
  }
}

function buildAnthropicUserContent(message: string, attachments?: VisionAttachment[]): string | ContentBlockParam[] {
  const images = (attachments || []).filter(a => a.mimeType?.startsWith('image/') && a.base64);
  if (!images.length) return message || ' ';

  const parts: ContentBlockParam[] = [];
  if (message.trim()) parts.push({ type: 'text', text: message });
  for (const img of images) {
    parts.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: img.base64,
      },
    });
  }
  if (!parts.length) parts.push({ type: 'text', text: ' ' });
  return parts;
}

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
  }

  async streamMessage(
    systemPrompt: string,
    history: { role: string; content: string }[],
    message: string,
    onChunk: (chunk: string) => void,
    onToolCall?: ToolCallHandler,
    attachments?: VisionAttachment[],
    phase?: string,
  ) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is missing');
    }

    const tools = getToolsForPhase(phase || 'diagnose');
    const chatModel = resolveAnthropicChatModel(phase);
    const usage: TokenUsage = {};

    const messages: MessageParam[] = history.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content || ' ',
    }));
    messages.push({ role: 'user', content: buildAnthropicUserContent(message, attachments) });

    const anthropicTools = buildAnthropicCachedTools(toAnthropicTools(tools));

    const MAX_TOOL_ROUNDS = 6;

    const streamRound = async (round: number): Promise<void> => {
      if (round >= MAX_TOOL_ROUNDS) return;

      const stream = this.client.messages.stream({
        model: chatModel,
        max_tokens: 8192,
        system: buildAnthropicCachedSystem(systemPrompt),
        messages,
        tools: anthropicTools,
      });

      stream.on('text', (textDelta) => {
        const cleaned = stripLeakedToolFragments(textDelta);
        if (cleaned) {
          onChunk(cleaned);
        }
      });

      const finalMessage = await stream.finalMessage();
      logAnthropicCacheUsage(`round-${round}`, finalMessage.usage);
      addUsage(usage, finalMessage.usage as TokenUsage);
      const toolUses = finalMessage.content.filter(
        (block): block is ToolUseBlock => block.type === 'tool_use',
      );

      if (!toolUses.length || !onToolCall) {
        return;
      }

      messages.push({ role: 'assistant', content: finalMessage.content });

      const toolResults: ContentBlockParam[] = [];
      for (const toolUse of toolUses) {
        let toolResult: unknown;
        try {
          toolResult = await onToolCall({
            name: toolUse.name,
            args: (toolUse.input ?? {}) as Record<string, unknown>,
          });
        } catch (e: unknown) {
          toolResult = { error: e instanceof Error ? e.message : 'tool failed' };
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(toolResult),
        });
      }

      messages.push({ role: 'user', content: toolResults });
      await streamRound(round + 1);
    };

    await streamRound(0);
    return { model: chatModel, usage };
  }
}

// Chat model for the coach. Default: Mistral Medium 3.5 — Mistral's agent-optimized
// frontier model (markedly better tool-calling/instruction-following than Large 3,
// which is the general-purpose flagship). Override via MISTRAL_CHAT_MODEL.
const MISTRAL_CHAT_MODEL = process.env.MISTRAL_CHAT_MODEL || 'mistral-medium-latest';

export class MistralProvider implements AIProvider {
  private client: Mistral;

  constructor() {
    this.client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY || '' });
  }

  async streamMessage(
    systemPrompt: string,
    history: { role: string, content: string }[],
    message: string,
    onChunk: (chunk: string) => void,
    onToolCall?: ToolCallHandler,
    attachments?: VisionAttachment[],
    phase?: string
  ) {
    if (!process.env.MISTRAL_API_KEY) {
        throw new Error('MISTRAL_API_KEY is missing');
    }

    const tools = getToolsForPhase(phase || 'diagnose');
    // Phase 1 (Diagnose) läuft auf Mistral Large — bewusst per Nutzerwunsch (bessere
    // Gesprächsführung/Instruction-Following im langen Diagnose-Prompt). Andere Phasen
    // bleiben auf MISTRAL_CHAT_MODEL. Per Env feinjustierbar ohne Code-Änderung.
    const chatModel =
      (phase || 'diagnose') === 'diagnose'
        ? (process.env.MISTRAL_DIAGNOSE_MODEL || 'mistral-large-latest')
        : MISTRAL_CHAT_MODEL;
    const usage: TokenUsage = {};
    const messages: ChatMessage[] = [
       { role: 'system', content: systemPrompt },
       ...history.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content || ' ' })),
       { role: 'user', content: buildMistralUserContent(message, attachments) }
    ];

    const MAX_TOOL_ROUNDS = 6;

    const streamRound = async (round: number): Promise<void> => {
      if (round >= MAX_TOOL_ROUNDS) return;

      const pending = new Map<number, MistralPendingToolCall>();
      const result = await this.client.chat.stream({
        model: chatModel,
        messages: messages as Parameters<typeof this.client.chat.stream>[0]['messages'],
        tools: toMistralTools(tools),
      });

      // Text pro Runde puffern: bei Tool-Calls verwerfen (kein Flackern), in der
      // finalen Runde einmal ausgeben — vermeidet doppelte/verschwindende Nachrichten.
      let roundBuffer = '';

      for await (const chunk of result) {
        addUsage(usage, chunk.data.usage as TokenUsage | undefined);
        const choice = chunk.data.choices[0];
        const content = choice?.delta?.content;
        if (content) {
          const cleaned = stripLeakedToolFragments(content as string);
          if (cleaned) roundBuffer += cleaned;
        }

        const toolCalls = choice?.delta?.toolCalls;
        if (toolCalls?.length) {
          for (const call of toolCalls) {
            mergeMistralToolCallDelta(pending, call as { index?: number; id?: string; function?: { name?: string; arguments?: string } });
          }
        }
      }

      if (!pending.size || !onToolCall) {
        if (roundBuffer) onChunk(roundBuffer);
        return;
      }

      const sorted = [...pending.entries()].sort((a, b) => a[0] - b[0]);
      const assistantToolCalls: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }> = [];
      const toolResults: Array<{
        role: 'tool';
        name: string;
        toolCallId: string;
        content: string;
      }> = [];

      for (const [, tc] of sorted) {
        if (!tc.name) continue;
        let args: Record<string, unknown> = {};
        try {
          args = tc.arguments ? JSON.parse(tc.arguments) : {};
        } catch (e: unknown) {
          console.warn('[Mistral] tool args parse failed:', tc.name, e);
          continue;
        }

        let toolResult;
        try {
          toolResult = await onToolCall({ name: tc.name, args });
        } catch (e: unknown) {
          toolResult = { error: e instanceof Error ? e.message : 'tool failed' };
        }

        assistantToolCalls.push({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments || '{}' },
        });
        toolResults.push({
          role: 'tool',
          name: tc.name,
          toolCallId: tc.id,
          content: JSON.stringify(toolResult),
        });
      }

      if (!assistantToolCalls.length) {
        if (roundBuffer) onChunk(roundBuffer);
        return;
      }

      // Tool-Runde: gepufferten Text verwerfen, nächste Runde starten.
      roundBuffer = '';

      // Mistral requires: assistant (with toolCalls) → tool results. Last role must be "tool".
      messages.push({ role: 'assistant', content: '', toolCalls: assistantToolCalls });
      for (const tr of toolResults) messages.push(tr);
      await streamRound(round + 1);
    };

    try {
      await streamRound(0);
    } catch (error: unknown) {
      // 429 rate limit or any Mistral failure → fall back to Gemini
      const statusCode = (error as { statusCode?: number } | null)?.statusCode;
      const errMessage = error instanceof Error ? error.message : String(error);
      const isRateLimit = statusCode === 429 || errMessage.includes('429') || errMessage.includes('rate_limit');
      console.warn(`Mistral failed (${isRateLimit ? '429 rate limit' : errMessage}) — falling back to Gemini`);
      const gemini = new GeminiProvider();
      // Reconstruct history for Gemini (no system / tool roles; fold tool results into user turns)
      const geminiHistory: { role: string; content: string }[] = [];
      const asText = (c: ChatMessage['content']): string =>
        typeof c === 'string' ? c : Array.isArray(c) ? c.map(p => ('text' in p ? p.text : '')).join(' ') : '';
      for (const m of messages.filter(msg => msg.role !== 'system')) {
        if (m.role === 'user') {
          geminiHistory.push({ role: 'user', content: asText(m.content) || ' ' });
        } else if (m.role === 'assistant') {
          geminiHistory.push({ role: 'assistant', content: asText(m.content) || ' ' });
        } else if (m.role === 'tool') {
          geminiHistory.push({
            role: 'user',
            content: `[Tool ${m.name} result]: ${asText(m.content) || '{}'}`,
          });
        }
      }
      const lastUserMsg = geminiHistory.filter(m => m.role === 'user').at(-1)?.content || message;
      if (geminiHistory.length && geminiHistory.at(-1)?.role === 'user') {
        geminiHistory.pop();
      }
      return gemini.streamMessage(systemPrompt, geminiHistory, lastUserMsg, onChunk, onToolCall, attachments, phase);
    }
    return { model: chatModel, usage };
  }
}

export function getProvider(): AIProvider {
  const providerName = (process.env.AI_PROVIDER || 'mistral').toLowerCase();
  if (providerName === 'anthropic' || providerName === 'claude') {
    return new AnthropicProvider();
  }
  if (providerName === 'gemini') {
    return new GeminiProvider();
  }
  return new MistralProvider();
}
