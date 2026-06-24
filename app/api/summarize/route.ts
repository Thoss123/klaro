import { NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: NextRequest) {
  try {
    const { messages, phase, canvas } = await req.json();

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ summary: '' }), { status: 200 });
    }

    // Build conversation transcript for summarization
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

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    let resultText = '';
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
      const result = await model.generateContent(prompt);
      resultText = result.response.text();
    } catch (error: unknown) {
      console.warn('Primary model failed in summarize API:', error instanceof Error ? error.message : String(error));
      console.log('Falling back to gemini-3.1-flash-lite...');
      const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });
      const result = await fallbackModel.generateContent(prompt);
      resultText = result.response.text();
    }
    
    // Parse JSON safely
    let summary = '';
    let chatTitle = '';
    try {
      // Remove markdown block if present
      const jsonStr = resultText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      summary = parsed.summary || resultText;
      chatTitle = parsed.title || 'Zusammenfassung';
    } catch {
      summary = resultText;
      chatTitle = `Phase: ${phase || 'diagnose'}`;
    }

    return new Response(JSON.stringify({ summary, chatTitle }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('API Summarize Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500 });
  }
}
