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

    let chat = model.startChat({ history: normalizedHistory });
    
    // We need a helper function to process the stream since we might need to do it multiple times for tool calls
    const processStream = async (res: any, currentChat: any) => {
      for await (const chunk of res.stream) {
         const chunkText = chunk.text();
         if (chunkText) {
             onChunk(chunkText);
         }
         
         const calls = chunk.functionCalls();
         if (calls && calls.length > 0 && onToolCall) {
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
            let retryChat = model.startChat({ history: normalizedHistory });
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
    const messages: any[] = [
       { role: 'system', content: systemPrompt },
       ...history.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content || ' ' })),
       { role: 'user', content: message }
    ];

    const MAX_TOOL_ROUNDS = 6;

    const streamRound = async (round: number): Promise<void> => {
      if (round >= MAX_TOOL_ROUNDS) return;

      const pending = new Map<number, MistralPendingToolCall>();
      const result = await this.client.chat.stream({
        model: 'mistral-large-latest',
        messages,
        tools: toMistralTools(tools),
      });

      for await (const chunk of result) {
        const choice = chunk.data.choices[0];
        const content = choice?.delta?.content;
        if (content) {
          const cleaned = stripLeakedToolFragments(content as string);
          if (cleaned.trim()) onChunk(cleaned);
        }

        const toolCalls = choice?.delta?.toolCalls;
        if (toolCalls?.length) {
          for (const call of toolCalls) mergeMistralToolCallDelta(pending, call);
        }
      }

      if (!pending.size || !onToolCall) return;

      const sorted = [...pending.entries()].sort((a, b) => a[0] - b[0]);
      const assistantToolCalls: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
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
        messages.push({
          role: 'tool',
          name: tc.name,
          toolCallId: tc.id,
          content: JSON.stringify(toolResult),
        });
      }

      if (!assistantToolCalls.length) return;

      messages.push({ role: 'assistant', content: '', toolCalls: assistantToolCalls });
      await streamRound(round + 1);
    };

    try {
      await streamRound(0);
    } catch (error: any) {
      // 429 rate limit or any Mistral failure → fall back to Gemini
      const isRateLimit = error?.statusCode === 429 || error?.message?.includes('429') || error?.message?.includes('rate_limit');
      console.warn(`Mistral failed (${isRateLimit ? '429 rate limit' : error?.message}) — falling back to Gemini`);
      const gemini = new GeminiProvider();
      // Reconstruct history without system message (Gemini gets it via systemInstruction)
      const geminiHistory = messages
        .filter(m => m.role !== 'system')
        .slice(0, -1) // last message is the current user message
        .map(m => ({ role: m.role, content: m.content }));
      const lastUserMsg = messages.filter(m => m.role === 'user').at(-1)?.content || message;
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
