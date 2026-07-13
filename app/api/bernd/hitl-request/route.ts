import { NextRequest, NextResponse } from 'next/server';
import { resolveCaller } from '@/lib/machine-auth';
import { persistBerndMessage } from '@/lib/bernd/channel';
import { tgSendMessage } from '@/lib/bernd/telegram';

export const maxDuration = 30;

/** Telegram-Hardlimit für Nachrichtentext (4096 Zeichen) — Entwurf wird sicher darunter gekürzt. */
const TELEGRAM_TEXT_LIMIT = 4096;
/** Entwurf wird auf diese Länge gekürzt, damit Betreff + Hinweis + Anleitung sicher unter das Telegram-Limit passen. */
const DRAFT_TRUNCATE_AT = 3500;

/**
 * Vertrag, den der n8n-Flow (`email-triage-draft`, Freigabe-Leg) aufruft, sobald ein
 * Antwort-Entwurf zur Freigabe ansteht (Architekturplan §6/WP6). Legt eine
 * `agent_pending_actions`-Zeile an (analog zur bestehenden WhatsApp-Steuerkanal-Route
 * `app/api/agent/pending/route.ts` POST) UND pusht zusätzlich proaktiv per Telegram an den
 * Owner — das bisher fehlende Stück, ohne das der Router
 * (`app/api/bernd/router/route.ts#handleHitl`) nur reaktiv wäre.
 *
 * POST /api/bernd/hitl-request
 *   Body:    { project_id: string, kind?: 'draft_approval',
 *              payload: { subject?: string, draft: string, mail_ref?: string, flow_slug: string } }
 *   Antwort: { ok: true, pending_id: string }
 *   Fehler:  400 (project_id/draft/flow_slug fehlt), 409 (kein verifiziertes Telegram-Pairing),
 *            401/404 (machine-auth, siehe lib/machine-auth.ts)
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { project_id, kind, payload } = body as {
    project_id?: string;
    kind?: string;
    payload?: { subject?: unknown; draft?: unknown; mail_ref?: unknown; flow_slug?: unknown };
  };

  const draft = typeof payload?.draft === 'string' ? payload.draft.trim() : '';
  const flowSlug = typeof payload?.flow_slug === 'string' ? payload.flow_slug.trim() : '';
  const subject = typeof payload?.subject === 'string' ? payload.subject.trim() : '';
  const mailRef = typeof payload?.mail_ref === 'string' ? payload.mail_ref.trim() : '';

  if (!project_id?.trim() || !draft || !flowSlug) {
    return NextResponse.json(
      { error: 'project_id, payload.draft, payload.flow_slug required' },
      { status: 400 },
    );
  }

  const caller = await resolveCaller(req, project_id);
  if ('error' in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

  // ── Owner-chat_id auflösen — nur ein VERIFIZIERTES Telegram-Pairing zählt ────────────────
  const { data: link, error: linkError } = await caller.supabase
    .from('bernd_channel_links')
    .select('chat_id')
    .eq('project_id', project_id)
    .eq('channel', 'telegram')
    .not('verified_at', 'is', null)
    .order('verified_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (linkError || !link?.chat_id) {
    return NextResponse.json(
      {
        error:
          'Kein verifiziertes Telegram-Pairing für dieses Projekt — der Betrieb muss sich zuerst im Bernd-Dashboard koppeln.',
      },
      { status: 409 },
    );
  }
  const chatId = link.chat_id as string;

  // ── Guard: existiert bereits eine offene (pending) Freigabe für diesen Chat? ─────────────
  // Der Router (handleHitl) fragt bei mehreren offenen Zeilen immer die NEUESTE ab — eine
  // ältere pending-Zeile würde also faktisch nie mehr beantwortet. Wir überschreiben sie
  // deshalb NICHT (neue Zeile ist ok), weisen aber im Telegram-Text darauf hin.
  const { data: olderPending } = await caller.supabase
    .from('agent_pending_actions')
    .select('id')
    .eq('project_id', project_id)
    .eq('contact', chatId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: inserted, error: insertError } = await caller.supabase
    .from('agent_pending_actions')
    .insert({
      user_id: caller.userId,
      project_id,
      channel: 'telegram',
      contact: chatId,
      kind: typeof kind === 'string' && kind.trim() ? kind.trim() : 'draft_approval',
      payload: { subject, draft, mail_ref: mailRef, flow_slug: flowSlug },
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? 'insert failed' }, { status: 500 });
  }
  const pendingId = inserted.id as string;

  // ── Proaktiver Telegram-Push ──────────────────────────────────────────────────────────────
  const truncatedDraft = draft.length > DRAFT_TRUNCATE_AT ? `${draft.slice(0, DRAFT_TRUNCATE_AT)}…` : draft;
  const subjectLine = subject ? `Betreff: ${subject}\n\n` : '';
  const olderHint = olderPending
    ? '\n\n(Hinweis: es liegt noch eine ältere Freigabe von mir offen — die hier ist die aktuelle.)'
    : '';
  const text = `${subjectLine}${truncatedDraft}${olderHint}\n\nAntworte: ja (senden) / nein (verwerfen) / oder schreib, was ich ändern soll.`.slice(
    0,
    TELEGRAM_TEXT_LIMIT,
  );

  await tgSendMessage(chatId, text);

  await persistBerndMessage(caller.supabase, {
    project_id,
    chat_id: chatId,
    direction: 'out',
    role: 'assistant',
    content: text,
    media_kind: 'text',
    meta: { kind: 'hitl_request', pending_id: pendingId },
  });

  return NextResponse.json({ ok: true, pending_id: pendingId });
}
