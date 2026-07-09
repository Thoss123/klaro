import { getSystemPrompt } from '@/lib/claude'
import { getCoachSystemPrompt, isCoachV2Enabled } from '@/lib/coach/assemble'
import { NextRequest, NextResponse } from 'next/server'
import { stripInternalTags } from '@/lib/strip-internal-tags'
import { formatTeamSize, isSoloTeam } from '@/lib/onboarding-labels'
import { resolveDiagnosePath } from '@/lib/onboarding-multi'
import { formatToolRecommendations } from '@/lib/tool-recommendations'
import { getBuiltWorkflows, getWorkflowPlans } from '@/lib/workflow-plans'
import type { DocumentTemplate } from '@/lib/types'
import type { KnowledgeSourceType } from '@/lib/rag'

/** Tool-Call vom Provider — args sind beliebiges JSON aus dem LLM. */
type ToolCall = { name: string; args: Record<string, unknown> }
/** Sicheres Lesen eines String-Arguments aus den (untypisierten) Tool-Args. */
const argStr = (v: unknown): string => (typeof v === 'string' ? v : '')

export async function POST(req: NextRequest) {
  try {
    const { messages, onboarding, phase, canvas, attachments, project_id, session_id, strategie: strategieOverride } = await req.json()
    const { createSupabaseServerClient } = await import('@/lib/supabase-server');
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
    }
    const { canAfford } = await import('@/lib/billing/credits');
    const affordability = await canAfford(user.id, 1);
    if (!affordability.ok) {
      return NextResponse.json(
        {
          code: 'INSUFFICIENT_CREDITS',
          balance: affordability.balance,
          required: affordability.required,
        },
        { status: 402 },
      );
    }

    const currentPhase = phase || 'diagnose'
    let systemPrompt = getSystemPrompt(currentPhase)

    // Coach v2: modularer Prompt aus /coach/prompts (base + Phasenmodul).
    // Revert: COACH_V2=false in .env.local — dann läuft der alte Pfad oben.
    if (isCoachV2Enabled()) {
      const v2Prompt = getCoachSystemPrompt(currentPhase)
      if (v2Prompt) {
        systemPrompt = v2Prompt
        console.log('[coach-v2] Modularer Coach-Prompt aktiv, Phase:', currentPhase)
      }
    }

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
        ? `Sprich den Nutzer mit dem Vornamen "${vorname}" an (Du-Form). Keine Dialog-Präfixe ("${vorname}:", "Axantilo:").`
        : `Sprich die Gruppe mit "ihr" an; Ansprechpartner: ${vorname}. Keine Dialog-Präfixe.`;

      const brancheVal = onboarding.branche?.trim() || 'Nicht angegeben'
      const rechercheVal = onboarding.firmen_recherche?.trim();
      const rechercheHinweis = rechercheVal
        ? ` Automatisch recherchiert (ungeprüft): ${rechercheVal} Greife das gleich zu Beginn des Gesprächs auf und frag kurz nach, ob das so stimmt bzw. was du ergänzen musst — geh nicht davon aus, dass es exakt korrekt ist.`
        : '';
      const firmenKontext =
        firmenname !== 'Nicht angegeben'
          ? `Unternehmen: ${firmenname}${brancheVal !== 'Nicht angegeben' ? ` (${brancheVal})` : ''}. Rolle des Gesprächspartners: ${rolle}. Nutze den Firmennamen für Kontext — nichts erfinden.${rechercheHinweis}`
          : `Rolle des Gesprächspartners: ${rolle}.`;

      systemPrompt = systemPrompt.replace(/{{vorname}}/g, vorname);
      systemPrompt = systemPrompt.replace(/{{firmenname}}/g, firmenname);
      systemPrompt = systemPrompt.replace(/{{rolle}}/g, rolle);
      systemPrompt = systemPrompt.replace(/{{firmen_kontext}}/g, firmenKontext);
      systemPrompt = systemPrompt.replace(/{{branche}}/g, brancheVal);
      systemPrompt = systemPrompt.replace(/{{ziel}}/g, onboarding.ziel || 'Nicht angegeben');
      systemPrompt = systemPrompt.replace(/{{ki_erfahrung}}/g, onboarding.ki_erfahrung || 'Nicht angegeben');
      systemPrompt = systemPrompt.replace(/{{wer_setzt_um}}/g, onboarding.wer_setzt_um || 'Nicht angegeben');
      systemPrompt = systemPrompt.replace(/{{technik_level}}/g, onboarding.technik_level || 'Nicht angegeben');
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
        } else if (path === 'E') {
          pfadLogik = 'Pfad E: Der Nutzer hat einen genauen Plan und will nur noch umsetzen. Überspringe sämtliche Diagnose. Frage ihn direkt, wie dieser Plan aussieht, validiere ihn extrem kurz auf Machbarkeit und schließe Phase 1 schnell ab, damit ihr in Phase 2 und 3 gehen könnt.';
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

    // Data layer context for Phase 3/4 prompts
    const { formatDataLayerForPrompt } = await import('@/lib/data-layer');
    const dataLayerText = formatDataLayerForPrompt(canvas?.data_layer);
    systemPrompt = systemPrompt.replace(/{{data_layer}}/g, dataLayerText);

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
    // Vorhandene Dokument-Vorlagen (kompakt — ohne den vollen Inhalt, damit der Prompt schlank bleibt).
    const templatesSummary = (canvas?.document_templates ?? []).map((t: DocumentTemplate) => ({
      id: t.id,
      title: t.title,
      linked_workflow: t.linked_workflow,
      role: t.role,
      delivery: t.delivery,
      source: t.source,
      placeholders: t.placeholders.map((p: { key: string }) => p.key),
      has_example: !!t.example_filled,
    }));
    const documentTemplatesJson = templatesSummary.length
      ? JSON.stringify(templatesSummary, null, 2)
      : '[]';
    systemPrompt = systemPrompt.replace(/{{document_templates}}/g, documentTemplatesJson);

    systemPrompt = systemPrompt.replace(/{{pain_points}}/g, painPointsJson);
    systemPrompt = systemPrompt.replace(/{{workflows}}/g, workflowsJson);
    systemPrompt = systemPrompt.replace(/{{workflow_plans}}/g, workflowPlansJson);
    systemPrompt = systemPrompt.replace(/{{company}}/g, companyJson);
    systemPrompt = systemPrompt.replace(/{{tool_recommendations}}/g, formatToolRecommendations());

    // ── Interne Gesprächsstrategie (projects.strategy) → {{strategie}} ────────
    // Projektweit (jede Phase = eigene Session-Zeile); fail-open — ohne Strategie
    // läuft der Coach einfach ohne Hypothesen los.
    let strategieText = 'Noch keine Strategie vorhanden.';
    // Direkte Übergabe (z.B. Simulations-Harness ohne DB-Projekt) hat Vorrang.
    if (typeof strategieOverride === 'string' && strategieOverride.trim()) {
      strategieText = strategieOverride.trim();
    } else if (project_id && systemPrompt.includes('{{strategie}}')) {
      try {
        const { data: projRow } = await supabase
          .from('projects')
          .select('strategy')
          .eq('id', project_id)
          .maybeSingle();
        if (projRow?.strategy?.trim()) strategieText = projRow.strategy.trim();
      } catch (e: unknown) {
        console.warn('[strategie-inject] failed (fail-open):', e instanceof Error ? e.message : String(e));
      }
    }
    systemPrompt = systemPrompt.replace(/{{strategie}}/g, strategieText);

    // ── Mindset-Leitlinien (Sprint 4.1) — phaseabhängig, still im Ton ─────────
    const { formatMindsetBlock } = await import('@/lib/mindset');
    const mindsetBlock = formatMindsetBlock(currentPhase);
    if (mindsetBlock) {
      systemPrompt += mindsetBlock;
      console.log(`[mindset-inject] phase=${currentPhase} → ${mindsetBlock.length} chars`);
    }

    // Node-Map-Regeln (eine-Node-eine-Aufgabe, Freigabe=sendAndWait+Loopback, Chain-vs-Agent,
    // selbst-liefernde Tools, Trigger-Wahl, Pflichtfelder) — der Coach soll sie IMMER befolgen.
    const { formatNodeMapForPrompt } = await import('@/lib/node-map');
    const nodeMapRules = formatNodeMapForPrompt([
      'n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.webhook', 'n8n-nodes-base.gmailTrigger',
      'n8n-nodes-base.formTrigger', 'n8n-nodes-base.gmail', 'n8n-nodes-base.slack',
      'n8n-nodes-base.if', 'n8n-nodes-base.switch', 'n8n-nodes-base.merge', 'n8n-nodes-base.wait',
      '@n8n/n8n-nodes-langchain.agent', '@n8n/n8n-nodes-langchain.chainLlm',
      '@n8n/n8n-nodes-langchain.chainSummarization', '@n8n/n8n-nodes-langchain.informationExtractor',
      'n8n-nodes-base.googleDrive', 'n8n-nodes-base.googleDocs', 'n8n-nodes-base.googleSheets',
      'n8n-nodes-base.airtable', 'n8n-nodes-base.set', 'n8n-nodes-base.httpRequest',
    ]);
    systemPrompt = systemPrompt.replace(/{{node_map_rules}}/g, nodeMapRules);

    // Current date → the coach's sense of "now" (otherwise it anchors on its training cutoff,
    // which makes "latest features/pricing" answers stale). German long format, e.g.
    // "Freitag, 12. Juni 2026".
    const heute = new Date().toLocaleDateString('de-DE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    systemPrompt = systemPrompt.replace(/{{heute}}/g, heute);

    if (canvas) {
      if (canvas.use_cases) {
        systemPrompt = systemPrompt.replace(
          /{{use_cases}}/g,
          JSON.stringify(canvas.use_cases, null, 2)
        );
      }
    }

    // RAG is now coach-driven via the `search_knowledge` tool (see onToolCall below),
    // not auto-injected — so irrelevant entries (e.g. wrong branche) are never forced
    // into context. The coach queries when it needs to and judges relevance itself.

    // Get AI Provider
    const { getProvider } = await import('@/lib/ai-provider');
    const provider = getProvider();

    // Parse messages
    const lastMessage = messages[messages.length - 1]?.content || ' ';
    const history = messages.slice(0, -1).map((m: { role: string; content?: string }) => {
      let text = m.content || ' ';
      if (m.role === 'assistant') {
        text = stripInternalTags(text) || ' ';
      }
      return {
        role: m.role,
        content: text
      };
    });

    // ── Auto-Injection: thematisch passendes Hintergrundwissen ────────────────
    // Anders als das coach-getriebene search_knowledge laden wir 'wissen'-Einträge
    // (Strategie/Aufklärung) automatisch, wenn sie zur aktuellen Nutzernachricht UND
    // zur aktuellen Phase passen — so erreicht das Wissen den Nutzer, auch wenn der
    // Coach das Tool nicht von sich aus aufruft.
    try {
      // Wissens-Frontmatter taggt Phasen als Nummern (1–4, alte Zählung) —
      // die gemergte Analyse deckt die alten Phasen 2 UND 3 ab.
      const PHASE_NRS: Record<string, string[]> = {
        diagnose: ['1'], analyse: ['2', '3'], plan: ['2', '3'], umsetzung: ['4'],
      };
      const phaseNrs = PHASE_NRS[currentPhase];
      if (phaseNrs && lastMessage.trim().length > 1) {
        const { searchKnowledge } = await import('@/lib/rag');
        const wissenHits = await searchKnowledge({
          query: lastMessage,
          types: ['wissen'],
          matchCount: 3,
          threshold: 0.5,
        });
        // Nach Phase filtern: Frontmatter `phase` ist als String gespeichert (z.B. "[2, 3]").
        const relevant = wissenHits.filter((h) => {
          const p = h?.metadata?.phase;
          if (p === undefined || p === null || String(p).trim() === '') return true; // ungetaggt → überall ok
          return phaseNrs.some(nr => String(p).includes(nr));
        });
        if (relevant.length > 0) {
          const block = relevant.map((h) => `### ${h.title}\n${h.content}`).join('\n\n---\n\n');
          systemPrompt +=
            `\n\n## HINTERGRUNDWISSEN (thematisch relevant)\n` +
            `Nutze diese Hintergrundinfos, um den Nutzer fundiert aufzuklären — erwähne die Datenbank/Quelle NIE und erfinde nichts dazu:\n\n${block}\n`;
          console.log(`[wissen-inject] phase=${currentPhase} → ${relevant.length}/${wissenHits.length} Einträge injiziert`);
        }
      }
    } catch (e: unknown) {
      console.error('[wissen-inject] failed (fail-open):', (e instanceof Error ? e.message : String(e)));
    }

    // Streaming Response zurückgeben
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          const usageResult = await provider.streamMessage(
            systemPrompt,
            history,
            lastMessage,
            (chunk: string) => {
               controller.enqueue(new TextEncoder().encode(chunk));
            },
            async (toolCall: ToolCall) => {
               console.log('[Tool Call Execution]:', toolCall.name, toolCall.args);

               if (toolCall.name === 'search_knowledge') {
                 try {
                   const { searchKnowledge } = await import('@/lib/rag');
                   const kategorie = typeof toolCall.args.kategorie === 'string' ? toolCall.args.kategorie : undefined;
                   const matches = await searchKnowledge({
                     query: argStr(toolCall.args.query),
                     types: kategorie ? ([kategorie] as KnowledgeSourceType[]) : undefined,
                     matchCount: 4,
                     threshold: 0.4,
                   });
                   console.log(`[search_knowledge] "${toolCall.args.query}" → ${matches.length} Treffer`);
                   if (!matches.length) {
                     return { treffer: [], hinweis: 'Keine passenden Einträge gefunden — nutze dein eigenes Wissen, ohne zu erfinden.' };
                   }
                   return {
                     treffer: matches.map((m) => ({
                       titel: m.title,
                       art: m.source_type,
                       relevanz: Math.round(m.similarity * 100) / 100,
                       branche: (m.metadata && m.metadata.branche) || null,
                       inhalt: m.content,
                     })),
                     hinweis: 'Verwende nur Treffer, die zur Branche und Situation des Nutzers passen. Ignoriere unpassende oder wenig relevante Einträge und erfinde nichts dazu.',
                   };
                 } catch (e: unknown) {
                   console.error('[search_knowledge] failed:', (e instanceof Error ? e.message : String(e)));
                   return { treffer: [], hinweis: 'Wissensdatenbank nicht verfügbar — nutze dein eigenes Wissen.' };
                 }
               } else if (toolCall.name === 'web_search') {
                 try {
                   const { searchWeb } = await import('@/lib/web-search');
                   const { answer, results, note } = await searchWeb(argStr(toolCall.args.query));
                   console.log(`[web_search] "${argStr(toolCall.args.query)}" → ${results.length} Treffer${note ? ' (' + note + ')' : ''}`);
                   if (note && !results.length) {
                     return { antwort: null, treffer: [], hinweis: note };
                   }
                   return {
                     antwort: answer,
                     treffer: results,
                     hinweis: 'Aktuelle Web-Infos. STRIKTE QUELLENTREUE: Übernimm Zahlen, Preise, Plan-Namen und Feature-Listen NUR wörtlich aus antwort/treffer — ergänze NICHTS aus deinem Trainingswissen (das ist veraltet). Steht ein Detail nicht in den Treffern, sag ehrlich, dass du es nicht verlässlich weißt, und nenne die offizielle Seite (URL aus den Treffern). VERBOTEN im Chat: die Wörter Zapier, Make, n8n — auch wenn sie in den Treffern stehen. Übersetze sie in: „das Tool hat offene Schnittstellen, ich kann es direkt in deinen automatischen Ablauf einbinden". Antworte KOMPAKT (3–4 Sätze + ggf. eine kurze Liste) — keine großen Tabellen, keine erfundenen Zusatzpakete oder Rechenbeispiele. Erwähne die Suche nicht im Chat.',
                   };
                 } catch (e) {
                   console.error('[web_search] failed:', (e as Error)?.message);
                   return { antwort: null, treffer: [], hinweis: 'Web-Suche nicht verfügbar — nutze dein eigenes Wissen.' };
                 }
               } else if (toolCall.name === 'prepare_phase') {
                 controller.enqueue(new TextEncoder().encode(`\n<tool_call>{"type":"prepare_phase","args":${JSON.stringify(toolCall.args)}}</tool_call>\n`));
                 return { status: 'success', message: `Phase ${toolCall.args.next_phase} prepared.` };
               } else if (toolCall.name === 'deploy_workflow') {
                 controller.enqueue(new TextEncoder().encode(`\n<tool_call>{"type":"deploy_workflow","args":${JSON.stringify(toolCall.args)}}</tool_call>\n`));
                 return { status: 'success', n8n_workflow_id: 'mock-123', url: 'https://workflows.axantilo.com/workflow/mock-123' };
               } else if (toolCall.name === 'test_workflow') {
                 controller.enqueue(new TextEncoder().encode(`\n<tool_call>{"type":"test_workflow","args":${JSON.stringify(toolCall.args)}}</tool_call>\n`));
                 return { status: 'success', logs: ['Execution started', 'Node 1 executed', 'Success'] };
               } else if (toolCall.name === 'request_credential') {
                 controller.enqueue(new TextEncoder().encode(`\n<tool_call>{"type":"request_credential","args":${JSON.stringify(toolCall.args)}}</tool_call>\n`));
                 return { status: 'pending', message: 'User has been prompted for credentials in the UI. Await confirmation.' };
               } else if (toolCall.name === 'create_document_template') {
                 if (currentPhase !== 'analyse' && currentPhase !== 'plan' && currentPhase !== 'umsetzung') {
                   return { status: 'error', message: 'create_document_template nur in Analyse & Plan oder Umsetzung.' };
                 }
                 if (!project_id) {
                   return { status: 'error', message: 'Kein Projekt — create_document_template abgebrochen.' };
                 }
                 controller.enqueue(new TextEncoder().encode(`\n<tool_call>{"type":"create_document_template","args":${JSON.stringify(toolCall.args)}}</tool_call>\n`));
                 try {
                   const origin = new URL(req.url).origin;
                   const cookie = req.headers.get('cookie') ?? '';
                   const res = await fetch(`${origin}/api/canvas-worker/create-template`, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json', cookie },
                     body: JSON.stringify({ project_id, ...toolCall.args }),
                   });
                   const data = await res.json();
                   if (!res.ok) {
                     return { status: 'error', message: data.error || 'Vorlage erstellen fehlgeschlagen' };
                   }
                   return {
                     status: 'success',
                     template_id: data.template_id,
                     message: `Vorlage liegt rechts auf dem Canvas (${data.placeholder_count ?? 0} Platzhalter). Sag dem Nutzer, dass er sie sehen kann, und erkläre kurz, welche Felder automatisch gefüllt werden.`,
                   };
                 } catch (e: unknown) {
                   console.error('[create_document_template] fetch failed:', (e instanceof Error ? e.message : String(e)));
                   return { status: 'error', message: 'Vorlage erstellen fehlgeschlagen.' };
                 }
               } else if (toolCall.name === 'setup_email_automation') {
                 if (!project_id) {
                   return { status: 'error', message: 'Kein Projekt — setup_email_automation abgebrochen.' };
                 }
                 controller.enqueue(new TextEncoder().encode(`\n<tool_call>{"type":"setup_email_automation","args":${JSON.stringify(toolCall.args)}}</tool_call>\n`));
                 try {
                   const { createSupabaseServerClient } = await import('@/lib/supabase-server');
                   const { deployEmailAutomation } = await import('@/lib/deploy-agent-workflow');
                   const { personaPath } = await import('@/lib/workspace');
                   const supabase = await createSupabaseServerClient();
                   const { data: { user } } = await supabase.auth.getUser();
                   if (!user) return { status: 'error', message: 'Nicht angemeldet.' };

                   const provider = argStr(toolCall.args.mail_provider);
                   const approvalMode = argStr(toolCall.args.approval_mode) === 'whatsapp' ? 'whatsapp' : 'draft';
                   const wa = argStr(toolCall.args.owner_whatsapp).replace(/^whatsapp:/, '').trim();
                   if (!['gmail', 'outlook', 'imap'].includes(provider)) {
                     return { status: 'error', message: 'mail_provider muss gmail, outlook oder imap sein.' };
                   }
                   if (approvalMode === 'whatsapp' && !/^\+\d{6,}$/.test(wa)) {
                     return { status: 'error', message: 'Für die WhatsApp-Freigabe fehlt owner_whatsapp (Format +43...).' };
                   }
                   if (approvalMode === 'draft' && provider !== 'gmail') {
                     return { status: 'error', message: 'Der eigenständige Postfach-Entwurf-Modus ist aktuell nur für Gmail verfügbar. Für Outlook/IMAP den WhatsApp-Modus nutzen.' };
                   }
                   const vorname = (onboarding?.vorname || onboarding?.username || '').trim();
                   const persona = vorname ? personaPath(vorname) : 'rules/persona_default.md';
                   const appBaseUrl = new URL(req.url).origin;

                   const out = await deployEmailAutomation(supabase, {
                     userId: user.id,
                     projectId: project_id,
                     mailProvider: provider as 'gmail' | 'outlook' | 'imap',
                     ownerWhatsapp: approvalMode === 'whatsapp' ? wa : undefined,
                     personaPath: persona,
                     appBaseUrl,
                     approvalMode,
                   });
                   if (!out.ok) return { status: 'error', message: out.error || 'Einrichtung fehlgeschlagen.' };

                   const providerLabel = provider === 'gmail' ? 'Gmail' : provider === 'outlook' ? 'Outlook' : 'deinem Postfach';
                   const freigabeHinweis = approvalMode === 'whatsapp'
                     ? 'er kann Entwürfe per WhatsApp freigeben oder anpassen'
                     : 'die fertigen Antwort-Entwürfe liegen dann in seinem Entwürfe-Ordner im Postfach — er prüft und sendet sie selbst';
                   return {
                     status: 'success',
                     deployed: out.workflows.length,
                     mail_connected: out.mailConnected,
                     approval_mode: approvalMode,
                     message: out.mailConnected
                       ? `E-Mail-Automation ist eingerichtet und aktiv (${providerLabel}). Ab jetzt wird jede eingehende Mail sortiert und für die wichtigen ein Antwort-Entwurf im Stil des Betriebs vorbereitet — ${freigabeHinweis}. Sag dem Nutzer freundlich, dass es läuft.${approvalMode === 'draft' ? ' Erwähne, dass er die Fern-Freigabe per WhatsApp optional dazuschalten kann.' : ''}`
                       : `E-Mail-Automation ist eingerichtet. LETZTER SCHRITT für den Nutzer: sein ${providerLabel}-Postfach verbinden (3-Klick-Login) — erst danach kann der Bot Mails lesen und Entwürfe anlegen. Sag ihm freundlich, dass nur noch die Postfach-Verbindung fehlt.`,
                   };
                 } catch (e: unknown) {
                   console.error('[setup_email_automation] failed:', e instanceof Error ? e.message : String(e));
                   return { status: 'error', message: 'Einrichtung der E-Mail-Automation fehlgeschlagen.' };
                 }
               } else if (toolCall.name === 'setup_chatbot') {
                 if (!project_id) {
                   return { status: 'error', message: 'Kein Projekt — setup_chatbot abgebrochen.' };
                 }
                 controller.enqueue(new TextEncoder().encode(`\n<tool_call>{"type":"setup_chatbot","args":{}}</tool_call>\n`));
                 try {
                   const { createSupabaseServerClient } = await import('@/lib/supabase-server');
                   const { deployFaqChatbot } = await import('@/lib/deploy-agent-workflow');
                   const { personaPath } = await import('@/lib/workspace');
                   const supabase = await createSupabaseServerClient();
                   const { data: { user } } = await supabase.auth.getUser();
                   if (!user) return { status: 'error', message: 'Nicht angemeldet.' };

                   const vorname = (onboarding?.vorname || onboarding?.username || '').trim();
                   const persona = vorname ? personaPath(vorname) : 'rules/persona_default.md';
                   const out = await deployFaqChatbot(supabase, {
                     userId: user.id,
                     projectId: project_id,
                     personaPath: persona,
                     appBaseUrl: new URL(req.url).origin,
                   });
                   if (!out.ok) return { status: 'error', message: out.error || 'Chatbot-Einrichtung fehlgeschlagen.' };
                   return {
                     status: 'success',
                     webhook_url: out.webhookUrl,
                     message: `Der FAQ-Chatbot ist eingerichtet und AKTIV — er läuft sofort (kein Postfach nötig). Fragen an ${out.webhookUrl} (POST { question }) werden aus dem Firmenwissen beantwortet. Sag dem Nutzer, dass sein Chatbot live ist und wie er ihn testen/einbinden kann, ohne technische Interna zu überladen.`,
                   };
                 } catch (e: unknown) {
                   console.error('[setup_chatbot] failed:', e instanceof Error ? e.message : String(e));
                   return { status: 'error', message: 'Chatbot-Einrichtung fehlgeschlagen.' };
                 }
               } else if (toolCall.name === 'update_agent_prompt') {
                 if (!project_id) {
                   return { status: 'error', message: 'Kein Projekt — update_agent_prompt abgebrochen.' };
                 }
                 try {
                   const { createSupabaseServerClient } = await import('@/lib/supabase-server');
                   const { getAgentPromptDef, promptOverridePath } = await import('@/lib/agent-prompts');
                   const { writeWorkspaceFile } = await import('@/lib/workspace');
                   const supabase = await createSupabaseServerClient();
                   const { data: { user } } = await supabase.auth.getUser();
                   if (!user) return { status: 'error', message: 'Nicht angemeldet.' };

                   const key = argStr(toolCall.args.prompt_key);
                   if (!getAgentPromptDef(key)) {
                     return { status: 'error', message: `Unbekannter prompt_key: ${key}` };
                   }
                   const content = typeof toolCall.args.content === 'string' ? toolCall.args.content.trim() : '';
                   const file = await writeWorkspaceFile(supabase, {
                     userId: user.id,
                     projectId: project_id,
                     path: promptOverridePath(key),
                     content, // leer = Override neutralisiert → Standard greift wieder
                     updatedBy: 'coach',
                   });
                   if (!file) return { status: 'error', message: 'Speichern fehlgeschlagen.' };
                   return {
                     status: 'success',
                     message: content
                       ? `Agenten-Prompt „${key}" angepasst (Version ${file.version}). Ab der nächsten E-Mail aktiv — kein Neustart nötig. Sag dem Nutzer in Alltagssprache, was sich ändert.`
                       : `Anpassung entfernt — „${key}" nutzt wieder den Standard.`,
                   };
                 } catch (e: unknown) {
                   console.error('[update_agent_prompt] failed:', e instanceof Error ? e.message : String(e));
                   return { status: 'error', message: 'Prompt-Anpassung fehlgeschlagen.' };
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

                   const editSteps = Array.isArray(toolCall.args.steps) ? toolCall.args.steps : [];
                   const editEdges = Array.isArray(toolCall.args.edges) ? toolCall.args.edges : undefined;
                   const out = await editWorkflowOnCanvas(
                     supabase,
                     user.id,
                     project_id,
                     argStr(toolCall.args.workflow_id),
                     editSteps,
                     editEdges,
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
                 } catch (e: unknown) {
                   console.error('[edit_workflow] failed:', (e instanceof Error ? e.message : String(e)));
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
                       steps: toolCall.args.steps,
                       linked_pain_point: toolCall.args.linked_pain_point,
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
                 } catch (e: unknown) {
                   console.error('[build_workflow] fetch failed:', (e instanceof Error ? e.message : String(e)));
                   return { status: 'error', message: 'Build fehlgeschlagen.' };
                 }
               } else if (toolCall.name === 'research_solutions') {
                 if (currentPhase !== 'analyse' && currentPhase !== 'plan') {
                   return { options: [], note: 'Recherche nur in Analyse & Plan verfügbar.' };
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
                 } catch (e: unknown) {
                   console.error('[research_solutions] fetch failed:', (e instanceof Error ? e.message : String(e)));
                   // Fail open: coach falls back to its own knowledge.
                   return { options: [], note: 'Recherche nicht verfügbar — nutze eigenes Wissen.' };
                 }
               }
               return { status: 'unknown_tool' };
            },
            Array.isArray(attachments) ? attachments : undefined,
            currentPhase
          );
          try {
            const { debitFromUsage } = await import('@/lib/billing/credits');
            await debitFromUsage({
              userId: user.id,
              usage: usageResult.usage,
              model: usageResult.model,
              action: 'chat',
              projectId: typeof project_id === 'string' ? project_id : null,
              sessionId: typeof session_id === 'string' ? session_id : null,
              metadata: { phase: currentPhase },
            });
          } catch (debitError: unknown) {
            console.warn('[billing] chat debit failed:', debitError instanceof Error ? debitError.message : String(debitError));
          }
        } catch (err: unknown) {
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
  } catch (error: unknown) {
    console.error('API Chat Error:', error);
    return new Response(error instanceof Error ? error.message : 'Internal Server Error', { status: 500 });
  }
}
