import { getSystemPrompt } from '@/lib/claude'
import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { stripInternalTags } from '@/lib/strip-internal-tags'
import { formatTeamSize, isSoloTeam } from '@/lib/onboarding-labels'
import { resolveDiagnosePath } from '@/lib/onboarding-multi'
import { formatToolRecommendations } from '@/lib/tool-recommendations'
import { getBuiltWorkflows, getWorkflowPlans } from '@/lib/workflow-plans'

export async function POST(req: NextRequest) {
  try {
    const { messages, onboarding, phase, canvas, attachments, project_id } = await req.json()

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
    const workflowsJson =
      canvas?.workflows?.length
        ? JSON.stringify(getBuiltWorkflows(canvas), null, 2)
        : '[]';
    const workflowPlansJson =
      canvas
        ? JSON.stringify(getWorkflowPlans(canvas), null, 2)
        : '[]';
    const companyJson = canvas?.company
      ? JSON.stringify(canvas.company, null, 2)
      : '{}';
    systemPrompt = systemPrompt.replace(/{{pain_points}}/g, painPointsJson);
    systemPrompt = systemPrompt.replace(/{{workflows}}/g, workflowsJson);
    systemPrompt = systemPrompt.replace(/{{workflow_plans}}/g, workflowPlansJson);
    systemPrompt = systemPrompt.replace(/{{company}}/g, companyJson);
    systemPrompt = systemPrompt.replace(/{{tool_recommendations}}/g, formatToolRecommendations());

    if (canvas) {
      if (canvas.use_cases) {
        systemPrompt = systemPrompt.replace(
          /{{use_cases}}/g,
          JSON.stringify(canvas.use_cases, null, 2)
        );
      }
    }

    // RAG Retrieval
    const { retrieveRelevantKnowledge } = await import('@/lib/rag');
    const ragContext = await retrieveRelevantKnowledge(
      messages[messages.length - 1]?.content || '',
      currentPhase,
    );
    if (ragContext) {
      systemPrompt += ragContext;
      console.log(`[RAG] Injected knowledge context into prompt.`);
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
               } else if (toolCall.name === 'create_workflow_plan') {
                 if (currentPhase !== 'plan') {
                   return { status: 'error', message: 'create_workflow_plan nur in Phase 3 erlaubt.' };
                 }
                 if (!project_id) {
                   return { status: 'error', message: 'Kein Projekt — create_workflow_plan abgebrochen.' };
                 }
                 // Ladezustand an UI senden
                 controller.enqueue(new TextEncoder().encode(`\n<tool_call>{"type":"create_workflow_plan","args":${JSON.stringify(toolCall.args)}}</tool_call>\n`));
                 try {
                   const origin = new URL(req.url).origin;
                   const cookie = req.headers.get('cookie') ?? '';
                   const res = await fetch(`${origin}/api/canvas-worker/create-plan`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json', cookie },
                     body: JSON.stringify({
                       project_id,
                       ...toolCall.args
                     }),
                   });
                   const data = await res.json();
                   if (!res.ok) {
                     return { status: 'error', message: data.error || 'Erstellen fehlgeschlagen' };
                   }
                   return { status: 'success', message: 'Plan erfolgreich auf dem Canvas platziert. Sag dem Nutzer, dass er ihn rechts sehen kann.' };
                 } catch (e: any) {
                   console.error('[create_workflow_plan] fetch failed:', e?.message);
                   return { status: 'error', message: 'Erstellen fehlgeschlagen.' };
                 }
               } else if (toolCall.name === 'edit_workflow') {
                 if (currentPhase !== 'umsetzung') {
                   return { status: 'error', message: 'edit_workflow nur in Phase 4.' };
                 }
                 if (!project_id) {
                   return { status: 'error', message: 'Kein Projekt — edit_workflow abgebrochen.' };
                 }
                 controller.enqueue(new TextEncoder().encode(`\n<tool_call>{"type":"edit_workflow","args":${JSON.stringify(toolCall.args)}}</tool_call>\n`));
                 try {
                   const { createSupabaseServerClient } = await import('@/lib/supabase-server');
                   const { editWorkflowOnCanvas } = await import('@/lib/edit-workflow-canvas');
                   const supabase = await createSupabaseServerClient();
                   const { data: { user } } = await supabase.auth.getUser();
                   if (!user) return { status: 'error', message: 'Nicht angemeldet.' };

                   const out = await editWorkflowOnCanvas(
                     supabase,
                     user.id,
                     project_id,
                     toolCall.args.workflow_id,
                     toolCall.args.instruction || toolCall.args.message || '',
                   );
                   if (!out.ok) {
                     return { status: 'error', message: out.error };
                   }
                   if (out.changed) {
                     controller.enqueue(new TextEncoder().encode(`\n<canvas_built>${JSON.stringify({ workflow_id: out.workflow.id })}</canvas_built>\n`));
                   }
                   return {
                     status: out.changed ? 'success' : 'unchanged',
                     workflow_id: out.workflow.id,
                     title: out.workflow.title,
                     editor_message: out.editorMessage,
                     message: out.changed
                       ? `Workflow „${out.workflow.title}" wurde angepasst: ${out.editorMessage}`
                       : out.editorMessage,
                   };
                 } catch (e: any) {
                   console.error('[edit_workflow] failed:', e?.message);
                   return { status: 'error', message: 'Workflow-Anpassung fehlgeschlagen.' };
                 }
               } else if (toolCall.name === 'build_workflow') {
                 if (currentPhase !== 'umsetzung') {
                   return { status: 'error', message: 'build_workflow nur in Phase 4.' };
                 }
                 if (!project_id) {
                   return { status: 'error', message: 'Kein Projekt — build_workflow abgebrochen.' };
                 }
                 // Status-Hinweis im UI ("baue…") — noch KEIN Canvas-Load (Build läuft erst).
                 controller.enqueue(new TextEncoder().encode(`\n<tool_call>{"type":"build_workflow","args":${JSON.stringify(toolCall.args)}}</tool_call>\n`));
                 try {
                   const origin = new URL(req.url).origin;
                   const cookie = req.headers.get('cookie') ?? '';
                   const res = await fetch(`${origin}/api/n8n/build-workflow`, {
                     method: 'POST',
                     headers: {
                       'Content-Type': 'application/json',
                       cookie,
                     },
                     body: JSON.stringify({
                       project_id,
                       workflow_id: toolCall.args.workflow_id,
                       title: toolCall.args.title,
                     }),
                   });
                   const data = await res.json();
                   if (!res.ok) {
                     return { status: 'error', message: data.error || 'Build fehlgeschlagen' };
                   }
                   // Build ist FERTIG + in Supabase gespeichert → Client SOFORT signalisieren,
                   // damit die Karte erscheint, ohne auf Realtime-Latenz zu warten. Das Tag
                   // kommt garantiert NACH dem Build (kein Race mehr).
                   const builtId = data.workflow?.id ?? toolCall.args.workflow_id;
                   controller.enqueue(new TextEncoder().encode(`\n<canvas_built>${JSON.stringify({ workflow_id: builtId })}</canvas_built>\n`));
                   return {
                     status: 'success',
                     workflow_id: data.workflow?.id,
                     title: data.workflow?.title,
                     alreadyBuilt: data.alreadyBuilt ?? false,
                     message: data.alreadyBuilt
                       ? `Workflow „${data.workflow?.title}" war schon gebaut.`
                       : `Workflow „${data.workflow?.title}" ist jetzt fertig gebaut und auf dem Canvas sichtbar.`,
                   };
                 } catch (e: any) {
                   console.error('[build_workflow] fetch failed:', e?.message);
                   return { status: 'error', message: 'Build fehlgeschlagen.' };
                 }
               } else if (toolCall.name === 'research_solutions') {
                 if (currentPhase !== 'plan') {
                   return { options: [], note: 'Recherche nur in Phase 3 verfügbar.' };
                 }
                 // Signal the UI that research is running (shown as a status hint).
                 controller.enqueue(new TextEncoder().encode(`\n<tool_call>{"type":"research_solutions","args":${JSON.stringify(toolCall.args)}}</tool_call>\n`));
                 try {
                   const origin = new URL(req.url).origin;
                   const res = await fetch(`${origin}/api/research`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify(toolCall.args),
                   });
                   const data = await res.json();
                   return data; // { options: [...] } back to the coach
                 } catch (e: any) {
                   console.error('[research_solutions] fetch failed:', e?.message);
                   // Fail open: coach falls back to its own knowledge.
                   return { options: [], note: 'Recherche nicht verfügbar — nutze eigenes Wissen.' };
                 }
               }
               return { status: 'unknown_tool' };
            },
            Array.isArray(attachments) ? attachments : undefined,
            currentPhase
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
