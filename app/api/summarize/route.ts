import { NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Message } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ summary: '' }), { status: 200 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    let result;
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
      result = await model.generateContent(prompt);
    } catch (error: any) {
      console.warn('Primary model failed in summarize API:', error?.message);
      console.log('Falling back to gemini-3.1-flash-lite...');
      const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });
      result = await fallbackModel.generateContent(prompt);
    }
    const summary = result.response.text();

    return new Response(JSON.stringify({ summary }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('API Summarize Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
