import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { requireUser, assertProjectOwner, accessDenied } from '@/lib/access-control';
import { withRateLimitRetry } from '@/lib/agents/llm';
import { canAfford, debitFromUsage } from '@/lib/billing/credits';
import { configToolsForMistral, runConfigTool, type BerndToolContext } from '@/lib/bernd/config-tools';
import { persistBerndMessage } from '@/lib/bernd/channel';
import { getBerndConfig } from '@/lib/bernd/config';
import { getTemplateManifest } from '@/lib/bernd/templates';
import type { BerndConfig } from '@/lib/bernd/types';

export const maxDuration = 90;

const MAX_TOOL_ROUNDS = 4;
const DASHBOARD_CHAT_ID = 'dashboard';
const WELCOME_CHAT_ID = 'welcome';

/** Sentinel: erste (verdeckte) Nachricht der Willkommens-Chat-Seite — löst nur den Gruß aus. */
const WELCOME_KICKOFF = '__welcome_kickoff__';

const SYSTEM_PROMPT = `Du bist der Änderungs-Assistent für Bernd. Der Inhaber will Bernd anpassen (Preise, Wissen, Textbausteine, bei welchen Mails er sich meldet, Flows an/aus). Frag bei Unklarheit nach, bevor du änderst; führe klare Änderungen via Tool aus und bestätige knapp.`;

/** Wird nur angehängt, wenn im Betriebsprofil noch keine Preislogik hinterlegt ist (Preisfrage kommt jetzt aus dem Chat, nicht mehr aus dem Wizard). */
const PREISLOGIK_NACHFRAGE_HINWEIS = `Falls im Betriebsprofil noch keine Preislogik (Stundensatz) hinterlegt ist, frage den Nutzer EINMAL freundlich danach — kurz begründet (Bernd braucht es für Angebote/Rechnungen) — aber dräng nicht, wenn er ausweicht. Sobald er einen Wert nennt, speichere ihn über das Tool set_price_param.`;

const GEWERK_LABEL: Record<string, string> = {
  elektriker: 'Elektriker',
  maler: 'Maler',
  shk: 'SHK (Sanitär/Heizung/Klima)',
  tischler: 'Tischler',
  sonstiges: 'Handwerksbetrieb',
};

/**
 * Willkommens-/Einrichtungs-Modus: Bernds allererste Unterhaltung direkt nach dem Onboarding.
 * Er stellt sich vor, fasst zusammen was eingerichtet wurde, erklärt die Telegram-Steuerung
 * und schließt die Einrichtung ab (z.B. Preise). Personalisiert mit Gewerk + aktiven Flows.
 */
function buildWelcomePrompt(config: BerndConfig | null): string {
  const gewerk = config?.gewerk ? GEWERK_LABEL[config.gewerk] ?? config.gewerk : 'Handwerksbetrieb';
  const flowLabels = (config?.active_templates ?? [])
    .map((t) => getTemplateManifest(t.slug)?.label ?? t.slug)
    .filter(Boolean);
  const flowList = flowLabels.length > 0 ? flowLabels.join(', ') : 'die passenden Standard-Abläufe';

  return `Du bist Bernd, der neue digitale Mitarbeiter für einen Handwerksbetrieb (Gewerk: ${gewerk}). Der Inhaber hat dich gerade eingerichtet — das ist EURE ALLERERSTE Unterhaltung. Sprich per „du", locker, herzlich und ohne Fachchinesisch.

Für den Betrieb wurde aktiviert: ${flowList}.

In deiner ERSTEN Nachricht:
1. Stell dich kurz vor (1 Satz).
2. Fasse in 2-3 Sätzen zusammen, was du ab jetzt für den Betrieb übernimmst — bezogen auf das oben Aktivierte.
3. Erkläre einfach, dass der Inhaber dich über Telegram steuert: per Text, per Sprachnachricht von der Baustelle oder per Foto vom Lieferschein. Weise darauf hin, dass er dich mit einem Klick oben („In Telegram öffnen") koppeln kann.
4. Lade ihn ein, dir Rückfragen zu stellen.
Halte diese erste Nachricht kompakt und einladend (keine Aufzählungszeichen-Wüste).

Danach beantwortest du Rückfragen und schließt die Einrichtung ab — Änderungen an Preisen, Wissen oder Melde-Regeln führst du direkt über die passenden Tools aus und bestätigst knapp.`;
}

type MistralMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
};

interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * POST /api/bernd/change { projectId, message, history? } → { text, tools_used }
 *
 * Server-seitiger Mistral-Function-Calling-Loop (Muster aus app/api/agent/assistant/route.ts),
 * gebunden an die geteilten Konfig-Tools aus lib/bernd/config-tools.ts (dieselben Tools, die
 * auch der Telegram-Router nutzt — Architekturplan §2/§5c). Persistiert in bernd_messages
 * (chat_id="dashboard"), Credit-Debit wie assistant/route.ts.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return accessDenied(auth);

  const body = await req.json().catch(() => ({}));
  const { projectId, message, history, mode } = body as {
    projectId?: string;
    message?: string;
    history?: HistoryTurn[];
    mode?: 'change' | 'welcome';
  };
  const isWelcome = mode === 'welcome';
  const isKickoff = isWelcome && message === WELCOME_KICKOFF;
  const chatId = isWelcome ? WELCOME_CHAT_ID : DASHBOARD_CHAT_ID;

  const owner = await assertProjectOwner(supabase, auth.userId, projectId ?? '');
  if (!owner.ok) return accessDenied(owner);

  if (!message?.trim()) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  const affordability = await canAfford(auth.userId, 1);
  if (!affordability.ok) {
    return NextResponse.json(
      { error: 'INSUFFICIENT_CREDITS', message: 'Credit-Guthaben aufgebraucht.' },
      { status: 402 },
    );
  }

  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: 'MISTRAL_API_KEY not configured' }, { status: 500 });

  const client = new Mistral({ apiKey });
  const model = 'mistral-large-latest';
  const ctx: BerndToolContext = { supabase, projectId: projectId as string, userId: auth.userId };

  const config = await getBerndConfig(supabase, projectId as string);
  const hatPreislogik = Boolean(
    config?.preislogik && typeof config.preislogik.stundensatz === 'string' && config.preislogik.stundensatz.trim(),
  );
  // Die Chat-Bubbles rendern kein Markdown → Bernd soll reinen Fließtext schreiben.
  const PLAIN_TEXT = 'Antworte in reinem, natürlichem Fließtext — KEINE Markdown-Formatierung (keine **Sternchen** für Fett, keine #-Überschriften, keine "-"-Aufzählungszeichen).';
  const basePrompt = isWelcome ? buildWelcomePrompt(config) : SYSTEM_PROMPT;
  const withPrice = hatPreislogik ? basePrompt : `${basePrompt}\n\n${PREISLOGIK_NACHFRAGE_HINWEIS}`;
  const systemPrompt = `${withPrice}\n\n${PLAIN_TEXT}`;

  const messages: MistralMessage[] = [
    { role: 'system', content: systemPrompt },
    ...(Array.isArray(history)
      ? history
          .filter((h) => h && typeof h.content === 'string' && (h.role === 'user' || h.role === 'assistant'))
          .map((h) => ({ role: h.role, content: h.content }))
      : []),
    { role: 'user', content: message },
  ];

  // Den verdeckten Willkommens-Kickoff nicht als echte Nutzer-Nachricht protokollieren.
  if (!isKickoff) {
    await persistBerndMessage(supabase, {
      project_id: projectId as string,
      chat_id: chatId,
      direction: 'in',
      role: 'user',
      content: message,
      media_kind: 'text',
      meta: {},
    });
  }

  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const toolsUsed: string[] = [];
  let finalText = '';

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const lastRound = round === MAX_TOOL_ROUNDS;
      const res = await withRateLimitRetry(() =>
        client.chat.complete({
          model,
          messages,
          ...(lastRound ? {} : { tools: configToolsForMistral(), toolChoice: 'auto' }),
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
          result = await runConfigTool(ctx, name, args);
        } catch (e: unknown) {
          result = { ok: false, message: e instanceof Error ? e.message : String(e) };
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
      userId: auth.userId,
      usage,
      model,
      action: 'bernd_change_chat',
      projectId,
      metadata: { tools_used: toolsUsed },
    }).catch((e) =>
      console.warn('[bernd/change] credit debit failed:', e instanceof Error ? e.message : String(e)),
    );

    const outText = finalText || 'Dazu habe ich gerade keine Antwort gefunden.';

    await persistBerndMessage(supabase, {
      project_id: projectId as string,
      chat_id: chatId,
      direction: 'out',
      role: 'assistant',
      content: outText,
      media_kind: 'text',
      meta: { tools_used: toolsUsed },
    });

    return NextResponse.json({
      text: outText,
      model,
      usage,
      tools_used: toolsUsed,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[bernd/change] failed:', msg);
    return NextResponse.json({ error: `change assistant failed: ${msg}` }, { status: 502 });
  }
}
