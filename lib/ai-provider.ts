import { GoogleGenerativeAI } from '@google/generative-ai';
import { Mistral } from '@mistralai/mistralai';
import { AITool, toGeminiTools, toMistralTools, KLARO_TOOLS } from './ai-tools';

export interface AIProvider {
  streamMessage(
    systemPrompt: string,
    history: { role: string, content: string }[],
    message: string,
    onChunk: (chunk: string) => void,
    onToolCall?: (toolCall: any) => Promise<any>
  ): Promise<void>;
}

export class GeminiProvider implements AIProvider {
  private genAI: GoogleGenerativeAI;
  
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  }
  
  async streamMessage(
    systemPrompt: string,
    history: { role: string, content: string }[],
    message: string,
    onChunk: (chunk: string) => void,
    onToolCall?: (toolCall: any) => Promise<any>
  ) {
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
      tools: [{ functionDeclarations: toGeminiTools(KLARO_TOOLS) }]
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
        const result = await chat.sendMessageStream(message);
        await processStream(result, chat);
    } catch (error: any) {
        console.warn('Primary model failed in AIProvider:', error?.message);
        console.log('Waiting 2 seconds before retrying due to potential rate limits...');
        await sleep(2000);
        
        try {
            // Retry with primary model first
            let retryChat = model.startChat({ history: normalizedHistory });
            const retryResult = await retryChat.sendMessageStream(message);
            await processStream(retryResult, retryChat);
        } catch (retryError: any) {
            console.warn('Retry failed:', retryError?.message);
            console.log('Falling back to gemini-3.1-flash-lite...');
            const fallbackModel = this.genAI.getGenerativeModel({
               model: "gemini-3.1-flash-lite",
               systemInstruction: systemPrompt,
               tools: [{ functionDeclarations: toGeminiTools(KLARO_TOOLS) }]
            });
            const fallbackChat = fallbackModel.startChat({ history: normalizedHistory });
            const fallbackResult = await fallbackChat.sendMessageStream(message);
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
    onToolCall?: (toolCall: any) => Promise<any>
  ) {
    if (!process.env.MISTRAL_API_KEY) {
        throw new Error('MISTRAL_API_KEY is missing');
    }

    const messages: any[] = [
       { role: 'system', content: systemPrompt },
       ...history.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content || ' ' })),
       { role: 'user', content: message }
    ];

    try {
      let result = await this.client.chat.stream({
         model: 'mistral-large-latest',
         messages,
         tools: toMistralTools(KLARO_TOOLS)
      });

      for await (const chunk of result) {
         const content = chunk.data.choices[0]?.delta?.content;
         if (content) {
             onChunk(content as string);
         }

         const toolCalls = chunk.data.choices[0]?.delta?.toolCalls;
         if (toolCalls && toolCalls.length > 0 && onToolCall) {
            for (const call of toolCalls) {
               if (call.function?.name && call.function?.arguments) {
                   const args = typeof call.function.arguments === 'string'
                       ? JSON.parse(call.function.arguments)
                       : call.function.arguments;

                   let toolResult;
                   try {
                       toolResult = await onToolCall({ name: call.function.name, args });
                   } catch (e: any) {
                       toolResult = { error: e.message };
                   }

                   messages.push({ role: 'assistant', content: '', toolCalls: [call] });
                   messages.push({ role: 'tool', name: call.function.name, toolCallId: call.id, content: JSON.stringify(toolResult) });

                   const nextResult = await this.client.chat.stream({
                      model: 'mistral-large-latest',
                      messages,
                      tools: toMistralTools(KLARO_TOOLS)
                   });

                   for await (const nextChunk of nextResult) {
                       const nextContent = nextChunk.data.choices[0]?.delta?.content;
                       if (nextContent) onChunk(nextContent as string);
                   }
               }
            }
         }
      }
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
      await gemini.streamMessage(systemPrompt, geminiHistory, lastUserMsg, onChunk, onToolCall);
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
