/**
 * DEV ONLY — returns the fully-built context (system prompt + history)
 * exactly as it would be sent to the model, plus a token estimate.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSystemPrompt } from '@/lib/claude';
import { formatTeamSize, isSoloTeam } from '@/lib/onboarding-labels';
import { resolveDiagnosePath } from '@/lib/onboarding-multi';

// Rough token estimate: German text averages ~3.5 chars/token for Mistral tokenizer
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// Mistral large context window
const MODEL_CONTEXT_LIMIT = 128_000;

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Dev only' }, { status: 403 });
  }

  const { messages, onboarding, phase, canvas } = await req.json();

  const currentPhase = phase || 'diagnose';
  let systemPrompt = getSystemPrompt(currentPhase);

  // Inject onboarding
  if (onboarding) {
    const isSolo = isSoloTeam(onboarding.unternehmensgroesse);
    const ugVal = formatTeamSize(onboarding.unternehmensgroesse);
    const vorname = (onboarding.vorname || onboarding.username || '').trim() || 'Nutzer';
    const firmenname = onboarding.firmenname?.trim() || 'Nicht angegeben';
    const rolle = onboarding.rolle_im_unternehmen?.trim() || 'Nicht angegeben';
    const anredeText = isSolo
      ? `Sprich den Nutzer mit dem Vornamen "${vorname}" an (Du-Form).`
      : `Sprich die Gruppe mit "ihr" an; Ansprechpartner: ${vorname}.`;
    const firmenKontext =
      firmenname !== 'Nicht angegeben'
        ? `Unternehmen: ${firmenname}. Rolle: ${rolle}.`
        : `Rolle: ${rolle}.`;

    systemPrompt = systemPrompt
      .replace(/{{vorname}}/g, vorname)
      .replace(/{{firmenname}}/g, firmenname)
      .replace(/{{rolle}}/g, rolle)
      .replace(/{{firmen_kontext}}/g, firmenKontext)
      .replace(/{{branche}}/g, onboarding.branche?.trim() || 'Nicht angegeben')
      .replace(/{{ziel}}/g, onboarding.ziel || 'Nicht angegeben')
      .replace(/{{ki_erfahrung}}/g, onboarding.ki_erfahrung || 'Nicht angegeben')
      .replace(/{{wer_setzt_um}}/g, onboarding.wer_setzt_um || 'Nicht angegeben')
      .replace(/{{hindernis}}/g, onboarding.hindernis || 'Nicht angegeben')
      .replace(/{{tempo}}/g, onboarding.tempo || 'Nicht angegeben')
      .replace(/{{unternehmensgroesse}}/g, ugVal)
      .replace(/{{anrede}}/g, anredeText)
      .replace(/{{memory}}/g, onboarding.memory || 'Bisher keine Historie.');

    // Adaptive Path Logic
    let pfadLogik = 'Keine besondere Pfad-Anweisung. Führe eine klassische, offene Diagnose durch.';
    if (currentPhase === 'diagnose' && onboarding.ziel) {
      const path = resolveDiagnosePath(onboarding.ziel);
      if (path === 'B') {
        pfadLogik = 'Pfad B: Der Nutzer hat gesagt, er hat schon konkrete Ideen. Überspringe die offene Diagnose von null auf. Frage direkt: "Du hast gesagt, du hast schon konkrete Ideen — erzähl mir, was dir vorschwebt." Höre zu, validiere ob die Idee realistisch und rentabel ist (frage nach konkreten Zahlen/Zeitverlust), UND ergänze das Gespräch mit offenen Fragen (z.B. "Gibt es neben dieser Idee noch ganz andere Bereiche, in denen viel Zeit verloren geht?").';
      } else if (path === 'C') {
        pfadLogik = 'Pfad C: Der Nutzer will erst einmal evaluieren, ob KI überhaupt sinnvoll ist. Analysiere Prozesse und filtere eiskalt heraus, welche Ideen keinen Sinn machen. WICHTIG: Der Grundton deines Gesprächs muss trotzdem überzeugend PRO-KI sein! Wir wollen unser eigenes Automatisierungs-Tool nicht wegrationalisieren. Zeige ihm, dass KI an den *richtigen* Stellen massive Hebelwirkung hat.';
      } else if (path === 'D') {
        pfadLogik = 'Pfad D: Der Nutzer will am Ende ein Briefing für seine IT-Abteilung. Führe die Diagnose ganz normal durch, um die besten Hebel zu finden. Denke aber im Hinterkopf mit: Am Ende bauen wir kein technisches n8n Tool für ihn, sondern ein klares architektonisches Konzept/Briefing für die IT.';
      } else {
        pfadLogik = 'Pfad A: Der Nutzer weiß noch nicht, wo er anfangen soll (Klassischer Flow). Führe die Diagnose ganz klassisch durch: Starte breit, suche Ineffizienzen und bohre tief, um konkrete Zeitfresser zu identifizieren.';
      }
    }
    systemPrompt = systemPrompt.replace(/{{pfad_logik}}/g, pfadLogik);
  }

  const painPointsJson =
    canvas?.pain_points?.length ? JSON.stringify(canvas.pain_points, null, 2) : '[]';
  const companyJson = canvas?.company ? JSON.stringify(canvas.company, null, 2) : '{}';
  systemPrompt = systemPrompt
    .replace(/{{pain_points}}/g, painPointsJson)
    .replace(/{{company}}/g, companyJson)
    .replace(
      /{{heute}}/g,
      new Date().toLocaleDateString('de-DE', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      }),
    );

  if (canvas?.use_cases) {
    systemPrompt = systemPrompt.replace(/{{use_cases}}/g, JSON.stringify(canvas.use_cases, null, 2));
  }

  // Build history (same stripping as chat route)
  const history = ((messages || []) as Array<{ role: string; content?: string }>).map((m) => {
    let text = m.content || ' ';
    if (m.role === 'assistant') {
      text = text
        .replace(/<canvas_update>[\s\S]*?<\/canvas_update>/g, '')
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
        .replace(/<phase_complete>[\s\S]*?<\/phase_complete>/g, '')
        .replace(/<request_credential>[\s\S]*?<\/request_credential>/g, '')
        .replace(/<deploy_workflow>[\s\S]*?<\/deploy_workflow>/g, '')
        .replace(/<test_workflow>[\s\S]*?<\/test_workflow>/g, '')
        .replace(/<activate_workflow>[\s\S]*?<\/activate_workflow>/g, '')
        .trim() || ' ';
    }
    return { role: m.role, content: text };
  });

  // Token estimates
  const systemTokens = estimateTokens(systemPrompt);
  const historyTokens = history.reduce((sum: number, m) => sum + estimateTokens(m.content), 0);
  const totalTokens = systemTokens + historyTokens;
  const pct = Math.round((totalTokens / MODEL_CONTEXT_LIMIT) * 100);

  return NextResponse.json({
    phase: currentPhase,
    model: 'mistral-large-latest',
    contextLimit: MODEL_CONTEXT_LIMIT,
    tokens: {
      system: systemTokens,
      history: historyTokens,
      total: totalTokens,
      pct,
      remaining: MODEL_CONTEXT_LIMIT - totalTokens,
    },
    systemPrompt,
    history,
  });
}
