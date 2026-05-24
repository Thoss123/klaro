import { getSystemPrompt } from '@/lib/claude'
import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(req: NextRequest) {
  try {
    const { messages, onboarding, phase, canvas } = await req.json()

    const currentPhase = phase || 'diagnose'
    let systemPrompt = getSystemPrompt(currentPhase)

    if (onboarding) {
      systemPrompt = systemPrompt.replace(/{{branche}}/g, onboarding.branche || 'Nicht angegeben');
      systemPrompt = systemPrompt.replace(/{{ziel}}/g, onboarding.ziel || 'Nicht angegeben');
      systemPrompt = systemPrompt.replace(/{{ki_erfahrung}}/g, onboarding.ki_erfahrung || 'Nicht angegeben');
      systemPrompt = systemPrompt.replace(/{{wer_setzt_um}}/g, onboarding.wer_setzt_um || 'Nicht angegeben');
      systemPrompt = systemPrompt.replace(/{{hindernis}}/g, onboarding.hindernis || 'Nicht angegeben');
      systemPrompt = systemPrompt.replace(/{{tempo}}/g, onboarding.tempo || 'Nicht angegeben');
      systemPrompt = systemPrompt.replace(/{{unternehmensgroesse}}/g, onboarding.unternehmensgroesse || 'Nicht angegeben');
      systemPrompt = systemPrompt.replace(/{{memory}}/g, onboarding.memory || 'Bisher keine Historie.');
    }

    if (canvas && canvas.pain_points) {
      systemPrompt = systemPrompt.replace(
        /{{pain_points}}/g, 
        JSON.stringify(canvas.pain_points, null, 2)
      );
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

    // Convert messages to Gemini format
    const rawHistory = messages.slice(0, -1).map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content || ' ' }]
    }));

    // Normalize history to ensure it alternates and starts with 'user'
    const geminiHistory: any[] = [];
    
    // If the history starts with a model response, prepend a default user prompt
    if (rawHistory.length > 0 && rawHistory[0].role === 'model') {
      geminiHistory.push({ role: 'user', parts: [{ text: 'Hallo, lass uns starten!' }] });
    }

    // Ensure alternating roles
    for (const msg of rawHistory) {
      if (geminiHistory.length === 0) {
        if (msg.role === 'user') {
          geminiHistory.push(msg);
        }
        continue;
      }

      const lastMsg = geminiHistory[geminiHistory.length - 1];
      if (lastMsg.role === msg.role) {
        // Append to the last message if the role is the same
        lastMsg.parts[0].text += '\n\n' + msg.parts[0].text;
      } else {
        geminiHistory.push(msg);
      }
    }

    // Ensure the last message in history (if any) is from 'model' 
    // so the upcoming user message is correctly alternating.
    // Wait, the upcoming message is always from the user.
    // So the history's last message MUST be 'model' (or empty history).
    if (geminiHistory.length > 0 && geminiHistory[geminiHistory.length - 1].role === 'user') {
       // If history ends with user, the next real message is also user? 
       // That means the API would get user -> user.
       // We can just pop it and append it to the real last message.
       const popped = geminiHistory.pop();
       messages[messages.length - 1].content = popped.parts[0].text + '\n\n' + messages[messages.length - 1].content;
    }

    const lastMessage = messages[messages.length - 1].content || ' ';

    let result;
    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-3.5-flash",
        systemInstruction: systemPrompt 
      });
      const chat = model.startChat({ history: geminiHistory });
      result = await chat.sendMessageStream(lastMessage);
    } catch (error: any) {
      console.warn('Primary model failed in chat API:', error?.message);
      console.log('Falling back to gemini-3.1-flash-lite...');
      const fallbackModel = genAI.getGenerativeModel({ 
        model: "gemini-3.1-flash-lite",
        systemInstruction: systemPrompt 
      });
      const fallbackChat = fallbackModel.startChat({ history: geminiHistory });
      result = await fallbackChat.sendMessageStream(lastMessage);
    }

    // Streaming Response zurückgeben
    const readableStream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          if (chunkText) {
            controller.enqueue(new TextEncoder().encode(chunkText));
          }
        }
        controller.close()
      },
    })

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error: any) {
    console.error('API Chat Error:', error);
    return new Response(error.message || 'Internal Server Error', { status: 500 });
  }
}
