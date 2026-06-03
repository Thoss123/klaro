import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { evaluateHistoryForCanvas, logSync, summarizeCanvasDiff } from '@/lib/sync-decision';
import { filterCanvasHistory } from '@/lib/hidden-chat';
import { normalizeCanvasData } from '@/lib/canvas-normalize';
import { runCanvasPipeline } from '@/lib/agent-orchestration';
import { mistralCompleteJson } from '@/lib/agents/llm';

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

    // Format chat history for context
    const chatContext = history.map((m: any) => `${m.role === 'user' ? 'Nutzer' : 'Coach'}: ${m.content}`).join('\n\n');

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
- **company.change_appetite**: "minimal" | "balanced" | "bold" (NUR wenn Nutzer A/B/C explizit gewählt hat).
- **use_cases**: id, title, linked_pain_point, **tools** (string[]).
  **STRENG:** Jedes Tool muss wörtlich im Chat vom **Nutzer** vorkommen (z.B. "Canva", "Word", "ChatGPT").
  **VERBOTEN:** Standard-Listen, Branchen-Defaults, Vermutungen (kein Lightroom, Shutterstock, CapCut, etc. wenn nicht genannt).
  **tools** = leeres Array [] wenn für diesen Pain Point noch kein konkretes Produkt genannt wurde.
  Keine Ziel-Lösungen als Tool (kein "KI-gestützte Textgenerierung").
  KEIN automation_level pro Use Case — nur company.change_appetite.
- **implementer**: NUR wenn Nutzer explizit Computer-Skills, Admin-Zugänge, Zeit pro Woche oder „wer setzt um“ genannt hat (Felder: who, skill_level, automation_experience).
- **documents** (optional): Tool-/Prozess-Notizen mit phase:'analyse' (z.B. "Aktuelle Marketing-Tools").
**workflows:** NICHT setzen (weglassen oder []) — das ist Phase 3.
Behalte bestehende Einträge, aktualisiere tools nur mit verifizierten Namen — nichts erfinden.`;
    } else if (phase === 'plan') {
      extractionInstruction = `Du extrahierst NUR in Phase 3 (Workflow-Blaupausen für n8n, später mit Agent-Orchestrierung):

**workflows** — Regeln:
- **Nur** Pain Points bearbeiten, die im **letzten Gesprächsblock** (letzte Coach- + Nutzer-Nachrichten) klar Thema waren. Kein zweiter Workflow zu einem anderen Pain Point „nebenbei“.
- **Korrekturen:** Bestehenden Workflow mit gleicher **linked_pain_point** (oder gleicher id) **aktualisieren** — Steps anpassen/ersetzen. **Niemals** zweiten Workflow für denselben Pain Point anlegen.
- **title:** Deutsch, **max. 3–5 Wörter** (z.B. „YouTube zu Reels“, „Reels Skript & Schnitt“).
- **linked_pain_point:** exakte id aus Canvas pain_points.
- **steps[]:** 6–10 Schritte, label + type (trigger | action | ai | decision | output). Nur Tools aus Chat/Canvas use_cases.

**Logik (vollautomatisiert wo möglich):**
- Ziel: möglichst viel automatisieren (Recherche, Skript, Schnitt, Zusammenbau) — nicht nur ein Teilschritt.
- Sinnvolle Reihenfolge: Idee/Trigger → KI-Recherche & Skript → **Nutzer-Freigabe Skript** (decision/output) → Aufnahme/Dreh → **KI-Schnitt in CapCut** → Captions/Varianten → **Nutzer-Freigabe vor Publish** (decision) → Veröffentlichen in Meta Suite.
- **VERBOTEN:** Skript in Business Suite **bevor** Video/Material existiert. Suite erst am Ende für Publish/Scheduling.
- **Human-in-the-loop** nur bei: strategische Wahl, Skript-Freigabe, Freigabe vor Veröffentlichung — nicht bei jedem KI-Zwischenschritt.

**Thema-Treue:** Wenn der Chat gerade „YouTube-Videos zu Reels“ besprechen — Workflow genau dazu. Kein separater „Skript für Anzeigen“-Workflow, wenn das im Chat nicht aktiv war.

- **documents** (optional): phase:'plan'.
**use_cases / pain_points / company:** vom bestehenden Canvas übernehmen, nicht neu erfinden.`;
    } else if (phase === 'umsetzung') {
      extractionInstruction = `Phase 4: documents mit phase:'umsetzung' falls Umsetzungsnotizen. Workflows nur ergänzen wenn im Chat besprochen.`;
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
