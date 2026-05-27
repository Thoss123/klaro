import { getSystemPrompt } from '@/lib/claude'
import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { stripInternalTags } from '@/lib/strip-internal-tags'
import { formatTeamSize, isSoloTeam } from '@/lib/onboarding-labels'
import { resolveDiagnosePath } from '@/lib/onboarding-multi'

export async function POST(req: NextRequest) {
  try {
    const { messages, onboarding, phase, canvas } = await req.json()

    const currentPhase = phase || 'diagnose'
    let systemPrompt = getSystemPrompt(currentPhase)

    // ── DEBUG LOG ──────────────────────────────────────────────────────────────
    console.log('\n=== /api/chat REQUEST ===')
    console.log('Phase:', currentPhase)
    console.log('Onboarding received:', JSON.stringify(onboarding, null, 2))
    console.log('Messages count:', messages?.length)
    // ──────────────────────────────────────────────────────────────────────────

    if (onboarding) {
      // Derive anrede (du vs ihr) from Unternehmensgröße
      const isSolo = isSoloTeam(onboarding.unternehmensgroesse)
      const ugVal = formatTeamSize(onboarding.unternehmensgroesse)
      const vorname = (onboarding.vorname || onboarding.username || '').trim() || 'Nutzer';
      const firmenname = onboarding.firmenname?.trim() || 'Nicht angegeben';
      const rolle = onboarding.rolle_im_unternehmen?.trim() || 'Nicht angegeben';
      const anredeText = isSolo
        ? `Sprich den Nutzer mit dem Vornamen "${vorname}" an (Du-Form). Keine Dialog-Präfixe ("${vorname}:", "Klaro:").`
        : `Sprich die Gruppe mit "ihr" an; Ansprechpartner: ${vorname}. Keine Dialog-Präfixe.`;

      const brancheVal = onboarding.branche?.trim() || 'Nicht angegeben'
      const firmenKontext =
        firmenname !== 'Nicht angegeben'
          ? `Unternehmen: ${firmenname}${brancheVal !== 'Nicht angegeben' ? ` (${brancheVal})` : ''}. Rolle des Gesprächspartners: ${rolle}. Nutze den Firmennamen für Kontext — nichts erfinden.`
          : `Rolle des Gesprächspartners: ${rolle}.`;

      systemPrompt = systemPrompt.replace(/{{vorname}}/g, vorname);
      systemPrompt = systemPrompt.replace(/{{firmenname}}/g, firmenname);
      systemPrompt = systemPrompt.replace(/{{rolle}}/g, rolle);
      systemPrompt = systemPrompt.replace(/{{firmen_kontext}}/g, firmenKontext);
      systemPrompt = systemPrompt.replace(/{{branche}}/g, brancheVal);
      systemPrompt = systemPrompt.replace(/{{ziel}}/g, onboarding.ziel || 'Nicht angegeben');
      systemPrompt = systemPrompt.replace(/{{ki_erfahrung}}/g, onboarding.ki_erfahrung || 'Nicht angegeben');
      systemPrompt = systemPrompt.replace(/{{wer_setzt_um}}/g, onboarding.wer_setzt_um || 'Nicht angegeben');
      systemPrompt = systemPrompt.replace(/{{hindernis}}/g, onboarding.hindernis || 'Nicht angegeben');
      systemPrompt = systemPrompt.replace(/{{tempo}}/g, onboarding.tempo || 'Nicht angegeben');
      systemPrompt = systemPrompt.replace(/{{unternehmensgroesse}}/g, ugVal);
      systemPrompt = systemPrompt.replace(/{{anrede}}/g, anredeText);

      // Adaptive Path Logic (supports multi-select ziel stored as " · "-separated)
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
      
      if (onboarding.memory) {
        console.log('[chat] Injected Memory:', onboarding.memory);
        systemPrompt = systemPrompt.replace(/{{memory}}/g, onboarding.memory);
      } else {
        console.log('[chat] Injected Memory: Bisher keine Historie.');
        systemPrompt = systemPrompt.replace(/{{memory}}/g, 'Bisher keine Historie.');
      }

      // ── DEBUG: show injected values + first 600 chars of system prompt ─────────
      console.log('\n--- Injected values ---')
      console.log(`branche="${brancheVal}" | ug="${ugVal}" | anrede="${anredeText}"`)
      console.log(`ziel="${onboarding.ziel}" | ki="${onboarding.ki_erfahrung}"`)
      console.log('\n--- System prompt (first 600 chars) ---')
      console.log(systemPrompt.substring(0, 600))
      console.log('--- end ---\n')
      // ─────────────────────────────────────────────────────────────────────────
    } else {
      console.warn('⚠️  No onboarding data received — all placeholders stay unreplaced!')
    }

    const painPointsJson =
      canvas?.pain_points?.length
        ? JSON.stringify(canvas.pain_points, null, 2)
        : '[]';
    const companyJson = canvas?.company
      ? JSON.stringify(canvas.company, null, 2)
      : '{}';
    systemPrompt = systemPrompt.replace(/{{pain_points}}/g, painPointsJson);
    systemPrompt = systemPrompt.replace(/{{company}}/g, companyJson);

    if (canvas) {
      if (canvas.use_cases) {
        systemPrompt = systemPrompt.replace(
          /{{use_cases}}/g,
          JSON.stringify(canvas.use_cases, null, 2)
        );
      }
    }

    // Get AI Provider
    const { getProvider } = await import('@/lib/ai-provider');
    const provider = getProvider();

    // Parse messages
    const lastMessage = messages[messages.length - 1]?.content || ' ';
    const history = messages.slice(0, -1).map((m: any) => {
      let text = m.content || ' ';
      if (m.role === 'assistant') {
        text = stripInternalTags(text) || ' ';
      }
      return {
        role: m.role,
        content: text
      };
    });

    // Streaming Response zurückgeben
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          await provider.streamMessage(
            systemPrompt,
            history,
            lastMessage,
            (chunk: string) => {
               controller.enqueue(new TextEncoder().encode(chunk));
            },
            async (toolCall: any) => {
               console.log('[Tool Call Execution]:', toolCall.name, toolCall.args);
               
               if (toolCall.name === 'prepare_phase') {
                 controller.enqueue(new TextEncoder().encode(`\n<tool_call>{"type":"prepare_phase","args":${JSON.stringify(toolCall.args)}}</tool_call>\n`));
                 return { status: 'success', message: `Phase ${toolCall.args.next_phase} prepared.` };
               } else if (toolCall.name === 'deploy_workflow') {
                 controller.enqueue(new TextEncoder().encode(`\n<tool_call>{"type":"deploy_workflow","args":${JSON.stringify(toolCall.args)}}</tool_call>\n`));
                 return { status: 'success', n8n_workflow_id: 'mock-123', url: 'https://workflows.klaro.ai/workflow/mock-123' };
               } else if (toolCall.name === 'test_workflow') {
                 controller.enqueue(new TextEncoder().encode(`\n<tool_call>{"type":"test_workflow","args":${JSON.stringify(toolCall.args)}}</tool_call>\n`));
                 return { status: 'success', logs: ['Execution started', 'Node 1 executed', 'Success'] };
               } else if (toolCall.name === 'request_credential') {
                 controller.enqueue(new TextEncoder().encode(`\n<tool_call>{"type":"request_credential","args":${JSON.stringify(toolCall.args)}}</tool_call>\n`));
                 return { status: 'pending', message: 'User has been prompted for credentials in the UI. Await confirmation.' };
               }
               return { status: 'unknown_tool' };
            }
          );
        } catch (err: any) {
           console.error('Provider Stream Error:', err);
           controller.enqueue(new TextEncoder().encode('\n\n[System Error: KI antwortet nicht richtig. Fallback oder Retry erforderlich.]'));
        } finally {
          controller.close();
        }
      },
    });

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
