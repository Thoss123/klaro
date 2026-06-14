import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { evaluateHistoryForCanvas, logSync, summarizeCanvasDiff } from '@/lib/sync-decision';
import { filterCanvasHistory } from '@/lib/hidden-chat';
import { normalizeCanvasData } from '@/lib/canvas-normalize';
import { runCanvasPipeline } from '@/lib/agent-orchestration';
import { mistralCompleteJson, withRateLimitRetry } from '@/lib/agents/llm';

export async function POST(req: NextRequest) {
  try {
    const { history, currentCanvas, onboarding, phase, projectId } = await req.json();

    if (!projectId) {
      logSync('canvas', 'skip', 'missing projectId');
      return NextResponse.json({ status: 'skipped', reason: 'missing_project_id' });
    }

    const hist = filterCanvasHistory(history || []);
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

    // ── Sprint 3: Agent-Orchestrierung ──────────────────────────────────────
    // In Phase `plan` läuft die Pipeline (Supervisor → Research → Workflow-QA)
    // vor der Extraktion. Sie kann (a) blocken (Coach driftet) oder (b) eine
    // ZWINGENDE Worker-Vorgabe liefern (ein Workflow, Reihenfolge, QA-Fixes).
    let workerDirective = '';
    const pipeline = await runCanvasPipeline(mistralCompleteJson(client), {
      phase: phase || 'diagnose',
      history: hist,
      canvas: (currentCanvas || {}) as Parameters<typeof runCanvasPipeline>[1]['canvas'],
    });
    if (pipeline.ran && !pipeline.proceed) {
      logSync('canvas', 'skip', 'orchestration deferred (no workflow topic yet)', {
        verdict: pipeline.supervisor?.verdict,
        phase,
      });
      return NextResponse.json({
        status: 'skipped',
        reason: 'orchestration_deferred',
        detail:
          'Im Gespräch ist noch kein klarer Workflow für einen Pain Point — der Coach klärt das zuerst.',
        verdict: pipeline.supervisor?.verdict,
        coach_hint: pipeline.supervisor?.coach_hint,
        orchestration: pipeline.logs,
      });
    }
    workerDirective = pipeline.workerDirective;

    // Format chat history for context.
    // In Phase `plan` extrahieren wir nur aus dem letzten Gesprächsblock (~7 Turns),
    // damit der Worker nicht alten Kontext aus früheren Pain Points aufgreift.
    const extractionHistory =
      (phase || 'diagnose') === 'plan' ? (history as any[]).slice(-14) : history;
    const chatContext = extractionHistory
      .map((m: any) => `${m.role === 'user' ? 'Nutzer' : 'Coach'}: ${m.content}`)
      .join('\n\n');

    // Phase `plan`: der Coach hängt die pain_point_id an den trigger-Tag.
    // Wir extrahieren sie und fokussieren den Worker hart auf genau diesen Pain Point.
    let focusPainPointId: string | null = null;
    if ((phase || 'diagnose') === 'plan') {
      const triggerMsgs = (history as any[]).filter(
        m => m.role === 'assistant' && typeof m.content === 'string' && m.content.includes('<trigger_canvas_update'),
      );
      const lastTrigger = triggerMsgs[triggerMsgs.length - 1];
      const ppMatch = lastTrigger?.content?.match(/pain_point_id="([^"]+)"/);
      if (ppMatch) focusPainPointId = ppMatch[1];
    }

    // System prompt explaining what to extract based on phase
    let extractionInstruction = '';
    if (phase === 'diagnose') {
      extractionInstruction = `Du extrahierst:
1. **company** (Objekt) — NUR primitive Strings/Arrays, KEINE verschachtelten Objekte:
   offer (string), target_customers (string), acquisition (string), process_steps (string[]), change_appetite (string), notes (string).
   Alias: services → offer. Kein { services: { ... } } — alles flach als Text.
2. **pain_points** (Array): id, title, description, frequency, effort, priority ('hoch'|'mittel'|'niedrig'). Nur wenn Tätigkeit + Häufigkeit oder Dauer genannt.
3. **documents** (optional): { id, title, content, format:'markdown', phase:'diagnose' } — Unternehmenszusammenfassung.
**workflows:** NICHT setzen (weglassen oder []).
Behalte bestehende Einträge, ergänze oder aktualisiere — nichts erfinden.`;
    } else if (phase === 'analyse') {
      extractionInstruction = `Du extrahierst:
- **pain_points** (NUR die bestehenden aus dem Canvas — KEINE neuen erfinden, Titel/Beschreibung nicht verändern): Wenn Nutzer und Coach im Chat eine **Reihenfolge/Priorisierung** der Pain Points festgelegt oder bestätigt haben, setze auf jedem betroffenen pain_point das Feld **rank** (Zahl, 1 = höchste Priorität, fortlaufend ohne Lücken). Ist im Chat keine Reihenfolge bestätigt, lass rank unverändert/weg.
- **use_cases**: id, title, linked_pain_point, **tools** (string[]).
  **STRENG:** Jedes Tool muss wörtlich im Chat vom **Nutzer** vorkommen (z.B. "Canva", "Word", "ChatGPT").
  **VERBOTEN:** Standard-Listen, Branchen-Defaults, Vermutungen (kein Lightroom, Shutterstock, CapCut, etc. wenn nicht genannt).
  **tools** = leeres Array [] wenn für diesen Pain Point noch kein konkretes Produkt genannt wurde.
  Keine Ziel-Lösungen als Tool (kein "KI-gestützte Textgenerierung").
  KEIN automation_level pro Use Case.
- **implementer**: NUR wenn Nutzer explizit Computer-Skills, Admin-Zugänge, Zeit pro Woche oder „wer setzt um“ genannt hat (Felder: who, skill_level, automation_experience).
- **documents** (optional): Tool-/Prozess-Notizen mit phase:'analyse' (z.B. "Aktuelle Marketing-Tools").
**workflows:** NICHT setzen (weglassen oder []) — das ist Phase 3.
Behalte bestehende Einträge, aktualisiere tools nur mit verifizierten Namen — nichts erfinden.`;
    } else if (phase === 'plan') {
      extractionInstruction = `Du extrahierst in Phase 3 KEINE workflows mehr, da diese jetzt per Tool Call erstellt werden.
      
- **documents** (optional): phase:'plan'.
**use_cases / pain_points / company:** vom bestehenden Canvas übernehmen, nicht neu erfinden.`;
    } else if (phase === 'umsetzung') {
      extractionInstruction = `Phase 4: documents mit phase:'umsetzung' falls Umsetzungsnotizen. Workflows nur ergänzen wenn im Chat besprochen.`;
    }

    if (focusPainPointId) {
      extractionInstruction += `

**FOKUS (ZWINGEND):** Bearbeite/aktualisiere AUSSCHLIESSLICH den Workflow mit linked_pain_point="${focusPainPointId}". Lege keinen Workflow für einen anderen Pain Point an. Existiert bereits einer für diese id — aktualisiere ihn, statt einen neuen anzulegen.`;
    }

    const globalRules = `
**Phase-Grenzen (strikt):**
- Extrahiere NUR Felder aus der Anweisung oben für die aktuelle Phase.
- **workflows** nur in Phase "plan" oder "umsetzung" — sonst Feld weglassen.
- **implementer** nur in Phase "analyse" und nur aus expliziten Nutzer-Aussagen.
`;

    const systemPrompt = `Du bist ein unsichtbarer Daten-Extraktor-Agent für ein KI-Beratungstool.
Deine Aufgabe: Analysiere den Chat-Verlauf und das AKTUELLE Canvas und gib ein NEUES, KOMPLETTES JSON-Canvas zurück.
Füge neue Erkenntnisse hinzu und behalte alte Erkenntnisse, es sei denn sie wurden widerlegt.

${extractionInstruction}
${globalRules}
${workerDirective ? `\n${workerDirective}\n` : ''}
Aktuelles Canvas JSON:
${JSON.stringify(currentCanvas || {})}

Gib AUSSCHLIESSLICH das neue Canvas JSON zurück. Kein Markdown, keine Erklärungen.`;

    // Call Mistral Small — bei 429 (Rate-Limit) mit Backoff wiederholen statt abbrechen.
    const response = await withRateLimitRetry(() => client.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Chat Verlauf:\n${chatContext}` }
      ],
      responseFormat: { type: 'json_object' }
    }));

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
    
    const updatedCanvas = normalizeCanvasData(
      newCanvas,
      (currentCanvas || null) as Parameters<typeof normalizeCanvasData>[1],
      phase || 'diagnose',
      hist
    );

    if (
      newCanvas.company &&
      typeof newCanvas.company === 'object' &&
      !Array.isArray(newCanvas.company) &&
      updatedCanvas.company
    ) {
      const rawKeys = Object.keys(newCanvas.company as object);
      const hadNested = rawKeys.some(k => {
        const v = (newCanvas.company as Record<string, unknown>)[k];
        return v !== null && typeof v === 'object' && !Array.isArray(v);
      });
      if (hadNested) {
        logSync('canvas', 'evaluate', 'normalized nested company fields from LLM', { rawKeys });
      }
    }

    if (phase !== 'umsetzung' && Array.isArray(newCanvas.workflows) && newCanvas.workflows.length > 0) {
      logSync('canvas', 'skip', `workflows ignored — phase=${phase} (only umsetzung extracts workflows)`);
    }

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

    return NextResponse.json({
      status: 'success',
      canvas: updatedCanvas,
      diff,
      orchestration: pipeline.ran
        ? { logs: pipeline.logs, totalTokens: pipeline.totalTokens }
        : undefined,
    });

  } catch (error: any) {
    console.error('[canvas-worker] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
