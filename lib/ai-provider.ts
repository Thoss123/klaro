import { GoogleGenerativeAI } from '@google/generative-ai';
import { Mistral } from '@mistralai/mistralai';
import { AITool, toGeminiTools, toMistralTools, getToolsForPhase } from './ai-tools';
import { stripLeakedToolFragments } from './strip-internal-tags';

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

// Control marker: tells the client to discard the coach text streamed so far in
// this turn. Emitted when a round streamed (premature) text live and then ended
// in tool calls — the model re-answers after the results, so the live text must
// be wiped before the final answer streams. Already-fired tag side effects stay.
const STREAM_RESET = '\n<stream_reset></stream_reset>\n';

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
    onToolCall?: (toolCall: any) => Promise<any>,
    attachments?: VisionAttachment[],
    phase?: string
  ): Promise<void>;
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
    onToolCall?: (toolCall: any) => Promise<any>,
    attachments?: VisionAttachment[],
    phase?: string
  ) {
    const tools = getToolsForPhase(phase || 'diagnose');
    const geminiHistory = history.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content || ' ' }]
    }));
    
    // Ensure history starts with 'user' if it exists and alternates
    const normalizedHistory: any[] = [];
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
      model: "gemini-3.5-flash",
      systemInstruction: systemPrompt,
      tools: [{ functionDeclarations: toGeminiTools(tools) }]
    });

    const chat = model.startChat({ history: normalizedHistory });
    
    // We need a helper function to process the stream since we might need to do it
    // multiple times for tool calls. Text is streamed live; if a round emits text
    // and then makes tool calls, we send STREAM_RESET so the client discards that
    // premature text — the model re-answers after the results and only the final
    // answer should remain (mirrors MistralProvider).
    const processStream = async (res: any, currentChat: any) => {
      let roundStreamedText = false;
      for await (const chunk of res.stream) {
         const chunkText = chunk.text();
         if (chunkText) {
             onChunk(chunkText);
             roundStreamedText = true;
         }

         const calls = chunk.functionCalls();
         if (calls && calls.length > 0 && onToolCall) {
            // Premature text from this round is superseded by the post-tool answer.
            if (roundStreamedText) {
               onChunk(STREAM_RESET);
               roundStreamedText = false;
            }
            for (const call of calls) {
               // Execute the tool call
               let toolResult;
               try {
                  toolResult = await onToolCall({ name: call.name, args: call.args });
               } catch (e: any) {
                  toolResult = { error: e.message };
               }

               // Send the result back to Gemini and continue streaming
               const nextResult = await currentChat.sendMessageStream([{
                  functionResponse: {
                     name: call.name,
                     response: toolResult
                  }
               }]);

               await processStream(nextResult, currentChat);
            }
         }
      }
    };
    
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
        const result = await chat.sendMessageStream(this.userParts(message, attachments));
        await processStream(result, chat);
    } catch (error: any) {
        console.warn('Primary model failed in AIProvider:', error?.message);
        console.log('Waiting 2 seconds before retrying due to potential rate limits...');
        await sleep(2000);
        
        try {
            // Retry with primary model first
            const retryChat = model.startChat({ history: normalizedHistory });
            const retryResult = await retryChat.sendMessageStream(this.userParts(message, attachments));
            await processStream(retryResult, retryChat);
        } catch (retryError: any) {
            console.warn('Retry failed:', retryError?.message);
            console.log('Falling back to gemini-3.1-flash-lite...');
            const fallbackModel = this.genAI.getGenerativeModel({
               model: "gemini-3.1-flash-lite",
               systemInstruction: systemPrompt,
               tools: [{ functionDeclarations: toGeminiTools(tools) }]
            });
            const fallbackChat = fallbackModel.startChat({ history: normalizedHistory });
            const fallbackResult = await fallbackChat.sendMessageStream(this.userParts(message, attachments));
            await processStream(fallbackResult, fallbackChat);
        }
    }
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
    onToolCall?: (toolCall: any) => Promise<any>,
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
    const messages: any[] = [
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
        messages,
        tools: toMistralTools(tools),
      });

      // Stream this round's text live (token by token). In multi-round tool loops
      // the model sometimes emits a premature answer in the same round as a tool
      // call, then answers AGAIN after seeing the results. We still stream it live,
      // but if the round ends in tool calls we send STREAM_RESET so the client
      // discards that premature text — only the final (tool-free) round's answer
      // stays. This keeps the message live even during tool calls without garbling.
      let roundStreamedText = false;

      for await (const chunk of result) {
        const choice = chunk.data.choices[0];
        const content = choice?.delta?.content;
        if (content) {
          const cleaned = stripLeakedToolFragments(content as string);
          if (cleaned) {
            onChunk(cleaned);
            roundStreamedText = true;
          }
        }

        const toolCalls = choice?.delta?.toolCalls;
        if (toolCalls?.length) {
          for (const call of toolCalls) {
            mergeMistralToolCallDelta(pending, call as { index?: number; id?: string; function?: { name?: string; arguments?: string } });
          }
        }
      }

      if (!pending.size || !onToolCall) {
        return; // final round — text already streamed live
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
        return; // no valid tool calls — text already streamed live
      }

      // This round streamed (premature) text live and is now going into another
      // round; the model will re-answer after the tool results. Tell the client to
      // drop the live text so only the final answer remains.
      if (roundStreamedText) onChunk(STREAM_RESET);

      // Mistral requires: assistant (with toolCalls) → tool results. Last role must be "tool".
      messages.push({ role: 'assistant', content: '', toolCalls: assistantToolCalls });
      for (const tr of toolResults) messages.push(tr);
      await streamRound(round + 1);
    };

    try {
      await streamRound(0);
    } catch (error: any) {
      // 429 rate limit or any Mistral failure → fall back to Gemini
      const isRateLimit = error?.statusCode === 429 || error?.message?.includes('429') || error?.message?.includes('rate_limit');
      console.warn(`Mistral failed (${isRateLimit ? '429 rate limit' : error?.message}) — falling back to Gemini`);
      const gemini = new GeminiProvider();
      // Reconstruct history for Gemini (no system / tool roles; fold tool results into user turns)
      const geminiHistory: { role: string; content: string }[] = [];
      for (const m of messages.filter(msg => msg.role !== 'system')) {
        if (m.role === 'user') {
          geminiHistory.push({ role: 'user', content: m.content || ' ' });
        } else if (m.role === 'assistant') {
          geminiHistory.push({ role: 'assistant', content: m.content || ' ' });
        } else if (m.role === 'tool') {
          geminiHistory.push({
            role: 'user',
            content: `[Tool ${m.name} result]: ${m.content || '{}'}`,
          });
        }
      }
      const lastUserMsg = geminiHistory.filter(m => m.role === 'user').at(-1)?.content || message;
      if (geminiHistory.length && geminiHistory.at(-1)?.role === 'user') {
        geminiHistory.pop();
      }
      await gemini.streamMessage(systemPrompt, geminiHistory, lastUserMsg, onChunk, onToolCall, attachments, phase);
    }
  }
}

export function getProvider(): AIProvider {
  const providerName = process.env.AI_PROVIDER || 'mistral';
  if (providerName === 'gemini') {
     return new GeminiProvider();
  }
  return new MistralProvider();
}
