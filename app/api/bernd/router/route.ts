import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import { resolveCaller } from '@/lib/machine-auth';
import { resolveAgentPrompt } from '@/lib/agent-prompts';
import { withRateLimitRetry } from '@/lib/agents/llm';
import { canAfford, debitFromUsage } from '@/lib/billing/credits';
import { loadRecentMessages, persistBerndMessage, resolveProjectByChatId, verifyPairing } from '@/lib/bernd/channel';
import { routerToolsForMistral, runRouterTool } from '@/lib/bernd/router-tools';
import type { BerndToolContext } from '@/lib/bernd/router-tools';
import type { BerndMessage, RouterDirective } from '@/lib/bernd/types';
import { getBerndConfig } from '@/lib/bernd/config';

export const maxDuration = 90;

const MAX_TOOL_ROUNDS = 4;
const MEMORY_WINDOW = 15;

/** Wird nur an den roleHint angehängt, wenn im Betriebsprofil noch keine Preislogik hinterlegt ist (Preisfrage kommt jetzt aus dem Chat, nicht mehr aus dem Wizard). */
const PREISLOGIK_NACHFRAGE_HINWEIS = `Falls im Betriebsprofil noch keine Preislogik (Stundensatz) hinterlegt ist, frage den Nutzer EINMAL freundlich danach — kurz begründet (Bernd braucht es für Angebote/Rechnungen) — aber dräng nicht, wenn er ausweicht. Sobald er einen Wert nennt, speichere ihn über das Tool set_price_param.`;

type MistralMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
};

type PendingAction = {
  id: string;
  contact: string;
  kind: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
};

/**
 * Das "Gehirn" des multimodalen Telegram-Routers (Architekturplan §2).
 *
 * n8n hat die Nachricht bereits kanalisiert (Text direkt, Voice/Photo über
 * /api/bernd/media vortranskribiert) und schickt hier normalisierten Text rein. Dieser
 * Endpoint löst den Mandanten auf, lädt Konversations-Memory, prüft auf offene HITL-
 * Bestätigungen und führt sonst einen Mistral-Function-Calling-Loop mit den Router-Tools
 * (Arbeits- + Konfig-Tools, lib/bernd/router-tools.ts) aus.
 *
 * POST /api/bernd/router  { chat_id, text, media_kind?, project_id? }
 *   → { directives: RouterDirective[], text }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { chat_id, text, media_kind, project_id: bodyProjectId } = body as {
    chat_id?: string;
    text?: string;
    media_kind?: string;
    project_id?: string;
  };

  if (!chat_id?.trim() || !text?.trim()) {
    return NextResponse.json({ error: 'chat_id, text required' }, { status: 400 });
  }

  const mediaKind: BerndMessage['media_kind'] =
    media_kind === 'voice' || media_kind === 'photo' ? media_kind : 'text';

  // machine-auth ohne festen project_id-Zwang: der Aufrufer (n8n) kennt project_id evtl.
  // noch nicht (frisch gekoppelter Chat) — wir lösen ihn ggf. selbst über chat_id auf.
  const caller = await resolveCaller(req, bodyProjectId ?? null);
  if ('error' in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

  // ── Pairing-Sonderfall: "/start <code>" verknüpft chat_id ↔ project_id ────────────────
  if (text.trim().startsWith('/start ')) {
    const code = text.trim().slice('/start '.length).trim();
    const result = await verifyPairing(caller.supabase, { chatId: chat_id, pairingCode: code });
    const reply = result.ok
      ? 'Verbunden! Ich bin startklar — schreib mir einfach, was ansteht.'
      : `Konnte nicht koppeln: ${result.reason ?? 'unbekannter Fehler'}`;
    return NextResponse.json({ directives: [{ kind: 'reply', text: reply }], text: reply });
  }

  const projectId = bodyProjectId?.trim() || (await resolveProjectByChatId(caller.supabase, chat_id));
  if (!projectId) {
    const reply =
      'Dieser Chat ist noch nicht mit einem Axantilo-Betrieb gekoppelt. Öffne dein Bernd-Dashboard und tippe den Pairing-Link an (t.me/<bot>?start=<code>).';
    return NextResponse.json({ directives: [{ kind: 'reply', text: reply }], text: reply });
  }

  const affordability = await canAfford(caller.userId, 1);
  if (!affordability.ok) {
    const reply = 'Mein Guthaben ist gerade aufgebraucht — bitte im Dashboard aufladen.';
    return NextResponse.json({ directives: [{ kind: 'reply', text: reply }], text: reply });
  }

  await persistBerndMessage(caller.supabase, {
    project_id: projectId,
    chat_id,
    direction: 'in',
    role: 'user',
    content: text,
    media_kind: mediaKind,
    meta: {},
  });

  const history = await loadRecentMessages(caller.supabase, { projectId, chatId: chat_id, limit: MEMORY_WINDOW });

  // ── HITL: offene pending action für diesen Chat? ───────────────────────────────────────
  const { data: pending } = await caller.supabase
    .from('agent_pending_actions')
    .select('*')
    .eq('project_id', projectId)
    .eq('contact', chat_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pending) {
    return handleHitl(caller.supabase, {
      userId: caller.userId,
      projectId,
      chatId: chat_id,
      text,
      pending: pending as PendingAction,
    });
  }

  // ── Sonst: freier Mistral-Function-Calling-Loop mit Router-Tools ──────────────────────
  const resolved = await resolveAgentPrompt(caller.supabase, {
    projectId,
    key: 'control/adhoc',
  }).catch(() => null);
  if (!resolved) return NextResponse.json({ error: 'prompt resolution failed' }, { status: 400 });

  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: 'MISTRAL_API_KEY not configured' }, { status: 500 });

  const client = new Mistral({ apiKey });
  const ctx: BerndToolContext = { supabase: caller.supabase, projectId, userId: caller.userId };

  const config = await getBerndConfig(caller.supabase, projectId);
  const hatPreislogik = Boolean(
    config?.preislogik && typeof config.preislogik.stundensatz === 'string' && config.preislogik.stundensatz.trim(),
  );

  const roleHint = `Du bist Bernd, der digitale Handwerker-Mitarbeiter des Inhabers — er erreicht dich per Telegram (Text/Sprache/Foto). Antworte kurz und direkt im Chat-Ton. Du erkennst auch Konfig-Wünsche ("bei Rechnungsmails musst du dich nicht melden", "setz meinen Stundensatz auf 95 €", "pausier den Angebots-Autopilot") und führst sie SOFORT über das passende Konfig-Tool aus, statt nur zu antworten. Für Wissensfragen nutze answer_from_knowledge. Erfinde nichts.${
    hatPreislogik ? '' : `\n\n${PREISLOGIK_NACHFRAGE_HINWEIS}`
  }`;

  const messages: MistralMessage[] = [
    { role: 'system', content: `${resolved.system}\n\n${roleHint}` },
    ...history.slice(0, -1).map((m): MistralMessage => ({
      role: m.role === 'tool' ? 'assistant' : m.role,
      content: m.content ?? '',
    })),
    { role: 'user', content: text },
  ];

  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const toolsUsed: string[] = [];
  let finalText = '';
  let flowDirective: RouterDirective | null = null;

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const lastRound = round === MAX_TOOL_ROUNDS;
      const res = await withRateLimitRetry(() =>
        client.chat.complete({
          model: resolved.model,
          messages,
          ...(lastRound ? {} : { tools: routerToolsForMistral(), toolChoice: 'auto' }),
        }),
      );

      usage.promptTokens += res.usage?.promptTokens ?? 0;
      usage.completionTokens += res.usage?.completionTokens ?? 0;
      usage.totalTokens += res.usage?.totalTokens ?? 0;

      const msg = res.choices?.[0]?.message;
      const toolCalls = msg?.toolCalls ?? [];
      const contentStr = typeof msg?.content === 'string' ? msg.content : '';

      if (!toolCalls.length || lastRound) {
        finalText = contentStr;
        break;
      }

      messages.push({
        role: 'assistant',
        content: contentStr,
        toolCalls: toolCalls.map((tc) => ({
          id: tc.id ?? '',
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments as string },
        })),
      });

      for (const tc of toolCalls) {
        const name = tc.function.name;
        toolsUsed.push(name);
        let result: unknown;
        try {
          const rawArgs = (tc.function.arguments as string) || '{}';
          const args = JSON.parse(rawArgs) as Record<string, unknown>;
          result = await runRouterTool(ctx, name, args);
          if (name === 'trigger_flow' && result && typeof result === 'object' && (result as { ok?: boolean }).ok) {
            flowDirective = {
              kind: 'trigger_flow',
              flow_slug: typeof args.slug === 'string' ? args.slug : undefined,
              args: args.args as Record<string, unknown> | undefined,
            };
          }
        } catch (e: unknown) {
          result = { error: e instanceof Error ? e.message : 'tool failed' };
        }
        messages.push({
          role: 'tool',
          name,
          toolCallId: tc.id ?? '',
          content: JSON.stringify(result),
        });
      }
    }

    await debitFromUsage({
      userId: caller.userId,
      usage,
      model: resolved.model,
      action: 'bernd_router',
      projectId,
      metadata: { tools_used: toolsUsed, chat_id, media_kind: mediaKind },
    }).catch((e) => console.warn('[bernd/router] credit debit failed:', e instanceof Error ? e.message : String(e)));

    const replyText = finalText || 'Dazu habe ich gerade keine Antwort gefunden.';
    const directives: RouterDirective[] = flowDirective
      ? [flowDirective, { kind: 'reply', text: replyText }]
      : [{ kind: 'reply', text: replyText }];

    await persistBerndMessage(caller.supabase, {
      project_id: projectId,
      chat_id,
      direction: 'out',
      role: 'assistant',
      content: replyText,
      media_kind: 'text',
      meta: { tools_used: toolsUsed, flow_slug: flowDirective?.flow_slug ?? null },
    });

    return NextResponse.json({ directives, text: replyText });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[bernd/router] failed:', msg);
    return NextResponse.json({ error: `router failed: ${msg}` }, { status: 502 });
  }
}

/**
 * HITL-Pfad: es existiert eine offene `pending`-Action für diesen Chat. Klassifiziere
 * zuerst confirm|revise|new — bei confirm die referenzierte Action laden + verifizieren
 * (noch pending, Payload plausibel), erst dann ausführen. Ein bloßes "ja" ohne wirklich
 * passende offene Action darf NICHT ausführen, sondern muss nachfragen.
 */
async function handleHitl(
  supabase: BerndToolContext['supabase'],
  args: { userId: string; projectId: string; chatId: string; text: string; pending: PendingAction },
) {
  const { userId, projectId, chatId, text, pending } = args;
  const lower = text.trim().toLowerCase();

  const isConfirm = /^(ja|jep|passt|ok|okay|senden|send|bestätigt|👍|✅)\b/.test(lower) || lower === 'ja.';
  const isCancel = /^(nein|abbrechen|verwerfen|stop)\b/.test(lower);

  let replyText: string;
  let directives: RouterDirective[];

  if (isConfirm) {
    // Referenzierte Action verifizieren: noch pending? (race mit einer zweiten Zeile ausschließen)
    const { data: fresh } = await supabase
      .from('agent_pending_actions')
      .select('*')
      .eq('id', pending.id)
      .eq('status', 'pending')
      .maybeSingle();

    if (!fresh) {
      replyText = 'Der Entwurf ist nicht mehr offen — evtl. schon erledigt. Sag mir gern, was als Nächstes ansteht.';
      directives = [{ kind: 'reply', text: replyText }];
    } else {
      await supabase
        .from('agent_pending_actions')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', pending.id);
      replyText = 'Alles klar, wird versendet. ✅';
      directives = [
        { kind: 'trigger_flow', flow_slug: typeof pending.payload?.flow_slug === 'string' ? pending.payload.flow_slug as string : undefined, args: { pending_action_id: pending.id } },
        { kind: 'reply', text: replyText },
      ];
    }
  } else if (isCancel) {
    await supabase
      .from('agent_pending_actions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', pending.id);
    replyText = 'Abgebrochen — der Entwurf wird nicht gesendet.';
    directives = [{ kind: 'reply', text: replyText }];
  } else {
    // Revision: Feedback in den Payload aufnehmen; die inhaltliche Überarbeitung passiert
    // im jeweiligen Flow (z.B. email/revise), dieser Endpoint hält nur den State konsistent.
    const feedbackLog = Array.isArray(pending.payload?.feedback_log)
      ? (pending.payload.feedback_log as unknown[])
      : [];
    const payload = { ...pending.payload, feedback_log: [...feedbackLog, { text, at: new Date().toISOString() }] };
    await supabase
      .from('agent_pending_actions')
      .update({ payload, updated_at: new Date().toISOString() })
      .eq('id', pending.id);
    replyText =
      'Verstanden, ich überarbeite den Entwurf nach deinem Feedback und melde mich mit der neuen Version.';
    directives = [
      { kind: 'trigger_flow', flow_slug: typeof pending.payload?.flow_slug === 'string' ? pending.payload.flow_slug as string : undefined, args: { pending_action_id: pending.id, revise: true } },
      { kind: 'reply', text: replyText },
    ];
  }

  await persistBerndMessage(supabase, {
    project_id: projectId,
    chat_id: chatId,
    direction: 'out',
    role: 'assistant',
    content: replyText,
    media_kind: 'text',
    meta: { hitl: true, pending_action_id: pending.id },
  });

  await debitFromUsage({
    userId,
    usage: { totalTokens: 1 },
    model: 'bernd-hitl',
    action: 'bernd_router_hitl',
    projectId,
    metadata: { chat_id: chatId, pending_action_id: pending.id },
  }).catch((e) => console.warn('[bernd/router] hitl debit failed:', e instanceof Error ? e.message : String(e)));

  return NextResponse.json({ directives, text: replyText });
}
