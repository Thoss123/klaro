import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { requireUser, assertProjectOwner, accessDenied } from '@/lib/access-control';
import { withRateLimitRetry } from '@/lib/agents/llm';
import { canAfford, debitFromUsage } from '@/lib/billing/credits';
import { persistBerndMessage } from '@/lib/bernd/channel';
import { getBerndConfig, upsertBerndSetupState } from '@/lib/bernd/config';
import { buildSetupSystemPrompt } from '@/lib/bernd/setup-prompt';
import { parseSetupTags, tagsToPatch, type SetupTag } from '@/lib/bernd/setup-tags';
import { COMPANY_BASE_PATH, readWorkspaceFile } from '@/lib/workspace';
import type { BerndConfig, BerndSetupState } from '@/lib/bernd/types';
import { stripInternalTags } from '@/lib/strip-internal-tags';
import { SCOPE_LABELS } from '@/lib/bernd/scopes';
import { detectBerndMailProvider } from '@/lib/bernd/mail-provider';

export const maxDuration = 60;

/** Chat-ID, unter der der Setup-Chat in `bernd_messages` protokolliert wird (analog `dashboard`/`welcome` in change/route.ts). */
const SETUP_CHAT_ID = 'setup';

/** Sentinel: erste (verdeckte) Nachricht der Setup-Chat-Seite — löst nur Bernds Eröffnung aus, wird nicht persistiert. */
const SETUP_KICKOFF = '__setup_kickoff__';

/** Anweisung, die anstelle des rohen Sentinels an das Modell geht (das Modell soll keinen internen Marker sehen). */
const SETUP_KICKOFF_INSTRUCTION = 'Beginne das Einstellungsgespräch mit deiner Eröffnung (Abschnitt 1 aus dem Gesprächsauftrag).';

const GEWERK_LABEL: Record<string, string> = {
  elektriker: 'Elektriker',
  maler: 'Maler',
  shk: 'SHK (Sanitär/Heizung/Klima)',
  tischler: 'Tischler',
  sonstiges: 'Handwerksbetrieb',
};

interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

type SetupMistralMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Baut eine kompakte Zusammenfassung des Onboarding-Wizard-Vorwissens aus `bernd_configs`
 * (Gewerk/Tools/Preislogik/Steckbrief) plus optional dem Zeitfresser-Abschnitt aus
 * `rules/company_base.md` (siehe `lib/bernd/provision.ts#buildCompanyBaseContent`) — das
 * Setup-Chat-System-Prompt darf nichts abfragen, was hier schon eindeutig beantwortet ist.
 */
async function buildVorwissen(
  supabase: SupabaseClient,
  config: BerndConfig | null,
  projectId: string,
): Promise<string> {
  if (!config) return 'Noch kein Vorwissen aus dem Onboarding-Wizard vorhanden.';

  const gewerk = config.gewerk ? GEWERK_LABEL[config.gewerk] ?? config.gewerk : 'unbekannt';
  const lines: string[] = [`- Gewerk: ${gewerk}`];
  const profile = config.setup_state?.profil;
  if (profile?.firmenname) lines.push(`- Unternehmen: ${profile.firmenname}`);
  if (profile?.ansprechpartner) lines.push(`- Ansprechpartner: ${profile.ansprechpartner}`);
  if (profile?.rolle) lines.push(`- Rolle: ${profile.rolle}`);
  if (profile?.mitarbeiter) lines.push(`- Teamgröße: ${profile.mitarbeiter}`);
  if (profile?.website) lines.push(`- Website: ${profile.website}`);

  const genutzt = asStringArray((config.tools as Record<string, unknown> | null)?.genutzt);
  if (genutzt.length > 0) lines.push(`- Bereits genutzte Tools: ${genutzt.join(', ')}`);
  const mailProvider = detectBerndMailProvider(config.tools, config.setup_state);
  if (mailProvider) lines.push(`- E-Mail-Anbieter: ${mailProvider === 'outlook' ? 'Outlook' : mailProvider === 'gmail' ? 'Gmail' : 'Anderer Anbieter'}`);

  const selectedScope = (config.setup_state?.scopes ?? []).find((scope) => scope.status === 'gewaehlt');
  if (selectedScope) lines.push(`- Verbindlicher Startbereich: ${SCOPE_LABELS[selectedScope.id] ?? selectedScope.id}`);

  const kanaele = asStringArray((config.tools as Record<string, unknown> | null)?.kommunikationskanaele);
  if (kanaele.length > 0) lines.push(`- Kommunikationskanäle mit Kunden: ${kanaele.join(', ')}`);

  const stundensatz = asString((config.preislogik as Record<string, unknown> | null)?.stundensatz);
  if (stundensatz.trim()) lines.push(`- Stundensatz: ${stundensatz} €`);

  const kannListe = asStringArray((config.steckbrief as Record<string, unknown> | null)?.kann);
  if (kannListe.length > 0) lines.push(`- Bereits vorbereitete Abläufe: ${kannListe.join(', ')}`);

  const companyBase = await readWorkspaceFile(supabase, projectId, COMPANY_BASE_PATH);
  const zeitfresserMatch = companyBase.match(/## Zeitfresser[^\n]*\n- ([^\n]+)/);
  if (zeitfresserMatch?.[1] && zeitfresserMatch[1].trim() !== 'nicht angegeben') {
    lines.push(`- Zeitfresser laut Wizard: ${zeitfresserMatch[1].trim()}`);
  }
  const concernsMatch = companyBase.match(/## Bedenken vor der Einrichtung\s*\n- ([^\n]+)/);
  if (concernsMatch?.[1]) lines.push(`- Genannte Bedenken: ${concernsMatch[1].trim()}`);

  const strategy = await readWorkspaceFile(supabase, projectId, 'rules/strategy.md');
  if (strategy.trim()) lines.push(`- Vorbereitete Strategie (Auszug): ${strategy.trim().slice(0, 1800)}`);

  return lines.length > 1 ? lines.join('\n') : 'Noch kein verwertbares Vorwissen aus dem Onboarding-Wizard vorhanden.';
}

/**
 * POST /api/bernd/setup { projectId, message, history?, gateStatus? } → SSE-Stream
 *
 * Setup-Chat für Bernds v2-Onboarding (WP2, Architekturplan §„Verhalten & Interaktion" +
 * §WP2). Streamt Mistral `mistral-large-latest` OHNE Tools (der Setup-Chat arbeitet
 * ausschließlich über Bernds Inline-Tags, siehe `lib/bernd/setup-tags.ts`) im selben
 * `data: {...}\n\n`-SSE-Format wie `app/api/agent/v1/chat/completions/route.ts`.
 *
 * Event-Vertrag:
 *   data: {"type":"delta","text":"…"}                                   — roher Text-Chunk
 *   data: {"type":"done","state":BerndSetupState,"uiTags":SetupTag[],"cleanText":string}
 *   data: {"type":"error","message":string}                             — nur bei Abbruch
 *
 * Deltas werden roh gestreamt (der Client hält angefangene Tags selbst über
 * `splitVisibleStream` zurück); `cleanText` im done-Event ist die autoritative sichtbare
 * Fassung (serverseitig aus dem vollen gepufferten Text via `parseSetupTags` berechnet).
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return accessDenied(auth);

  const body = await req.json().catch(() => ({}));
  const { projectId, message, history, gateStatus } = body as {
    projectId?: string;
    message?: string;
    history?: HistoryTurn[];
    gateStatus?: string;
  };

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

  const pid = projectId as string;
  const isKickoff = message === SETUP_KICKOFF;

  const config = await getBerndConfig(supabase, pid);
  const gewerk = config?.gewerk ? GEWERK_LABEL[config.gewerk] ?? config.gewerk : 'Handwerksbetrieb';
  const vorwissen = await buildVorwissen(supabase, config, pid);
  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });

  const systemPrompt = buildSetupSystemPrompt({
    gewerk,
    vorwissen,
    gateStatus: gateStatus?.trim() || 'unbekannt',
    heute,
  });

  const mistralMessages: SetupMistralMessage[] = [
    { role: 'system', content: systemPrompt },
    ...(Array.isArray(history)
      ? history
          .filter((h) => h && typeof h.content === 'string' && (h.role === 'user' || h.role === 'assistant'))
          .map((h) => ({ role: h.role, content: h.content }))
      : []),
    { role: 'user', content: isKickoff ? SETUP_KICKOFF_INSTRUCTION : (message as string) },
  ];

  // Den verdeckten Setup-Kickoff nicht als echte Nutzer-Nachricht protokollieren (analog WELCOME_KICKOFF in change/route.ts).
  if (!isKickoff) {
    await persistBerndMessage(supabase, {
      project_id: pid,
      chat_id: SETUP_CHAT_ID,
      direction: 'in',
      role: 'user',
      content: message as string,
      media_kind: 'text',
      meta: {},
    });
  }

  const client = new Mistral({ apiKey });
  const model = 'mistral-large-latest';
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      let fullText = '';
      const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      try {
        const result = await withRateLimitRetry(() =>
          client.chat.stream({
            model,
            messages: mistralMessages as Parameters<typeof client.chat.stream>[0]['messages'],
          }),
        );

        for await (const chunk of result) {
          const u = chunk.data.usage;
          if (u) {
            usage.promptTokens += u.promptTokens ?? 0;
            usage.completionTokens += u.completionTokens ?? 0;
            usage.totalTokens += u.totalTokens ?? 0;
          }
          const delta = chunk.data.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) {
            fullText += delta;
            send({ type: 'delta', text: delta });
          }
        }

        const { cleanText, tags } = parseSetupTags(fullText);
        const patch = tagsToPatch(tags);
        const uiTags: SetupTag[] = tags.filter((t) => t.type === 'getcredential' || t.type === 'wissen_anfrage');

        let newState: BerndSetupState = config?.setup_state ?? {};
        if (Object.keys(patch).length > 0) {
          const updated = await upsertBerndSetupState(supabase, {
            userId: auth.userId,
            projectId: pid,
            patch,
          });
          if (updated) newState = updated;
        }

        const outText = cleanText || 'Dazu habe ich gerade keine Antwort gefunden.';
        const persistedText = stripInternalTags(outText).trim() || outText;

        await persistBerndMessage(supabase, {
          project_id: pid,
          chat_id: SETUP_CHAT_ID,
          direction: 'out',
          role: 'assistant',
          content: persistedText,
          media_kind: 'text',
          meta: { tags: tags.map((t) => t.type) },
        });

        await debitFromUsage({
          userId: auth.userId,
          usage,
          model,
          action: 'bernd_setup',
          projectId: pid,
          metadata: { tags: tags.map((t) => t.type) },
        }).catch((e: unknown) =>
          console.warn('[bernd/setup] credit debit failed:', e instanceof Error ? e.message : String(e)),
        );

        send({ type: 'done', state: newState, uiTags, cleanText: outText });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[bernd/setup] stream failed:', msg);
        send({ type: 'error', message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
