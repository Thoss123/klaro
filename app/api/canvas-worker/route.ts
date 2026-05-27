import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { evaluateHistoryForCanvas, logSync, summarizeCanvasDiff } from '@/lib/sync-decision';

export async function POST(req: NextRequest) {
  try {
    const { history, currentCanvas, onboarding, phase, projectId } = await req.json();

    if (!projectId) {
      logSync('canvas', 'skip', 'missing projectId');
      return NextResponse.json({ status: 'skipped', reason: 'missing_project_id' });
    }

    const hist = history || [];
    const histCheck = evaluateHistoryForCanvas(phase || 'diagnose', hist);
    if (!histCheck.ok) {
      logSync('canvas', 'skip', histCheck.detail, { reason: histCheck.reason, phase });
      return NextResponse.json({ status: 'skipped', reason: 'insufficient_context', detail: histCheck.detail });
    }
    logSync('canvas', 'invoke', `Mistral extract phase=${phase}`, {
      reason: histCheck.detail,
      historyMessages: hist.length,
    });

    // Mistral API
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      logSync('canvas', 'skip', 'MISTRAL_API_KEY missing');
      return NextResponse.json({ status: 'skipped', reason: 'no_api_key' });
    }
    
    const client = new Mistral({ apiKey });

    // Format chat history for context
    const chatContext = history.map((m: any) => `${m.role === 'user' ? 'Nutzer' : 'Coach'}: ${m.content}`).join('\n\n');

    // System prompt explaining what to extract based on phase
    let extractionInstruction = '';
    if (phase === 'diagnose') {
      extractionInstruction = `Du extrahierst:
1. **company** (Objekt): offer, target_customers, acquisition (wie neue Kunden/Kontakte entstehen — VOR dem ersten Projekt), process_steps (Array: geordnete Schritte von Akquise bis Ergebnis), notes (optional).
2. **pain_points** (Array): id, title, description, frequency, effort, priority ('hoch'|'mittel'|'niedrig'). Nur wenn Tätigkeit + Häufigkeit oder Dauer genannt.
3. **documents** (optional): kurze Markdown-Zusammenfassung des Unternehmens als { id, title, content, format:'markdown' }.
Behalte bestehende Einträge, ergänze oder aktualisiere — nichts erfinden.`;
    } else if (phase === 'analyse') {
      extractionInstruction = `Du extrahierst:
- **company.change_appetite**: "minimal" | "balanced" | "bold" (aus A/B/C-Antwort des Nutzers).
- **use_cases**: id, title, linked_pain_point, tool (nur genannte Tools!), automation_level (minimal|balanced|bold), priority.
- **implementer**: Profil wenn Kenntnisse/Zeit genannt.
Behalte bestehende Daten, ergänze — nichts erfinden.`;
    } else if (phase === 'plan') {
      extractionInstruction = `Du extrahierst Workflows (id, title, linked_pain_point, steps). Jeder Step braucht id, label, type (trigger/action/ai/decision/output).`;
    }

    const systemPrompt = `Du bist ein unsichtbarer Daten-Extraktor-Agent für ein KI-Beratungstool.
Deine Aufgabe: Analysiere den Chat-Verlauf und das AKTUELLE Canvas und gib ein NEUES, KOMPLETTES JSON-Canvas zurück.
Füge neue Erkenntnisse hinzu und behalte alte Erkenntnisse, es sei denn sie wurden widerlegt.

${extractionInstruction}

Aktuelles Canvas JSON:
${JSON.stringify(currentCanvas || {})}

Gib AUSSCHLIESSLICH das neue Canvas JSON zurück. Kein Markdown, keine Erklärungen.`;

    // Call Mistral Small
    const response = await client.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Chat Verlauf:\n${chatContext}` }
      ],
      responseFormat: { type: 'json_object' }
    });

    const raw = response.choices?.[0]?.message?.content;
    const newCanvasRaw = typeof raw === 'string' ? raw : '';
    if (!newCanvasRaw) throw new Error('Empty response from Mistral');

    let newCanvas: Record<string, unknown>;
    try {
      const cleaned = newCanvasRaw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      newCanvas = JSON.parse(cleaned);
    } catch {
      logSync('canvas', 'skip', 'invalid JSON from Mistral');
      return NextResponse.json({ status: 'skipped', reason: 'invalid_json' });
    }
    
    // Ensure basic structure
    const updatedCanvas = {
      pain_points: newCanvas.pain_points || currentCanvas?.pain_points || [],
      use_cases: newCanvas.use_cases || currentCanvas?.use_cases || [],
      workflows: newCanvas.workflows || currentCanvas?.workflows || [],
      documents: newCanvas.documents || currentCanvas?.documents || [],
      company: newCanvas.company || currentCanvas?.company,
      implementer: newCanvas.implementer || currentCanvas?.implementer,
      phase: phase
    };

    const diff = summarizeCanvasDiff(
      (currentCanvas || {}) as Parameters<typeof summarizeCanvasDiff>[0],
      updatedCanvas as Parameters<typeof summarizeCanvasDiff>[1]
    );
    logSync('canvas', 'success', `saved project=${projectId}`, { diff, phase });

    // Save to Supabase (this will trigger Realtime updates in the client!)
    const supabase = await createSupabaseServerClient();
    
    const { error: upsertError } = await supabase.from('project_canvas').upsert({
      project_id: projectId,
      data: updatedCanvas,
      updated_at: new Date().toISOString()
    }, { onConflict: 'project_id' });

    if (upsertError) {
      logSync('canvas', 'fail', 'Supabase upsert failed', { error: upsertError.message });
      return NextResponse.json({ status: 'error', reason: 'db_save_failed', error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ status: 'success', canvas: updatedCanvas, diff });

  } catch (error: any) {
    console.error('[canvas-worker] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
