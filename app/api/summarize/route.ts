import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { accessDenied, requireUser } from '@/lib/access-control';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const userResult = await requireUser(supabase);
    if (!userResult.ok) return accessDenied(userResult);

    const { messages, phase, canvas } = await req.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json({ summary: '' });
    }

    const transcript = (messages as Array<{ role: string; content?: string }>)
      .map((m) => `${m.role === 'user' ? 'Nutzer' : 'Axantilo'}: ${m.content}`)
      .join('\n\n');

    const canvasSummary = canvas ? `\n\nAktuelle Canvas-Daten:\n${JSON.stringify(canvas, null, 2)}` : '';

    const prompt = `Du bist ein Zusammenfassungs-Assistent für Axantilo, einen KI-Coach.

Fasse das folgende Gespräch aus Phase "${phase || 'diagnose'}" präzise zusammen. 

ANTWORTE AUSSCHLIESSLICH IN DIESEM JSON-FORMAT:
{
  "title": "Kurzer Titel für diesen Chat (max 4 Worte, z.B. 'Problemanalyse Marketing')",
  "summary": "Deine detaillierte Zusammenfassung..."
}

Strukturiere die Zusammenfassung ('summary') so:
1. **Unternehmensprofil:** Was macht das Unternehmen, Branche, Größe
2. **Erkenntnisse:** Die wichtigsten Findings
3. **Pain Points:** Alle identifizierten Probleme
4. **KI-Erfahrung:** Was der Nutzer schon kennt
5. **Offene Punkte:** Was noch unklar ist
6. **Stimmung/Ton:** Wie kommuniziert der Nutzer

Schreib auf Deutsch, präzise, keine Floskeln. Maximal 500 Wörter für die summary.
${canvasSummary}

--- GESPRÄCHSVERLAUF ---
${transcript}`;

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GOOGLE_API_KEY not configured' }, { status: 503 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    let resultText = '';
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
      const result = await model.generateContent(prompt);
      resultText = result.response.text();
    } catch (error: unknown) {
      console.warn('Primary model failed in summarize API:', error instanceof Error ? error.message : String(error));
      const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });
      const result = await fallbackModel.generateContent(prompt);
      resultText = result.response.text();
    }

    let summary = '';
    let chatTitle = '';
    try {
      const jsonStr = resultText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      summary = parsed.summary || resultText;
      chatTitle = parsed.title || 'Zusammenfassung';
    } catch {
      summary = resultText;
      chatTitle = `Phase: ${phase || 'diagnose'}`;
    }

    return NextResponse.json({ summary, chatTitle });
  } catch (error: unknown) {
    console.error('API Summarize Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
