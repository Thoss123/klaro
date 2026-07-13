import { NextRequest, NextResponse } from 'next/server';
import { resolveCaller } from '@/lib/machine-auth';
import { persistBerndMessage } from '@/lib/bernd/channel';
import { tgSendMessage } from '@/lib/bernd/telegram';

export const maxDuration = 30;

const TELEGRAM_TEXT_LIMIT = 4096;

/**
 * POST /api/bernd/notify
 *
 * Machine-authentifizierter Ausgang fuer proaktive Hinweise aus n8n, die keine
 * Freigabe erzeugen (z. B. Eingangsrechnungen oder dringende Systemmeldungen).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { project_id, text, kind } = body as {
    project_id?: string;
    text?: string;
    kind?: string;
  };

  const projectId = project_id?.trim() ?? '';
  const message = text?.trim() ?? '';
  if (!projectId || !message) {
    return NextResponse.json({ error: 'project_id and text required' }, { status: 400 });
  }

  const caller = await resolveCaller(req, projectId);
  if ('error' in caller) {
    return NextResponse.json({ error: caller.error }, { status: caller.status });
  }

  const { data: link, error: linkError } = await caller.supabase
    .from('bernd_channel_links')
    .select('chat_id')
    .eq('project_id', projectId)
    .eq('channel', 'telegram')
    .not('verified_at', 'is', null)
    .order('verified_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (linkError || !link?.chat_id) {
    return NextResponse.json(
      { error: 'Kein verifiziertes Telegram-Pairing fuer dieses Projekt.' },
      { status: 409 },
    );
  }

  const chatId = link.chat_id as string;
  const outgoing = message.slice(0, TELEGRAM_TEXT_LIMIT);
  await tgSendMessage(chatId, outgoing);
  await persistBerndMessage(caller.supabase, {
    project_id: projectId,
    chat_id: chatId,
    direction: 'out',
    role: 'assistant',
    content: outgoing,
    media_kind: 'text',
    meta: { kind: kind?.trim() || 'workflow_notice' },
  });

  return NextResponse.json({ ok: true });
}
