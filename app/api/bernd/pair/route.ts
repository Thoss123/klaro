import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { requireUser, assertProjectOwner, accessDenied } from '@/lib/access-control';

/**
 * GET  /api/bernd/pair?projectId=<id>  → { linked, code?, chat_id? }
 * POST /api/bernd/pair { projectId }   → erzeugt/erneuert einen Pairing-Code
 *
 * Verwaltet die `bernd_channel_links`-Zeile fürs Telegram-Pairing (Architekturplan §5,
 * Punkt 4): Dashboard zeigt den Deep-Link `t.me/<bot>?start=<code>`, der Telegram-Router
 * (`/api/bernd/router`, `/start <code>`) verifiziert den Code und setzt `verified_at`.
 * Cookie-Auth + Projekt-Ownership wie die übrigen `/api/bernd/*`-Routen.
 */

function generatePairingCode(): string {
  // 6-stelliger numerischer Code — kurz genug zum Abtippen, falls der Deep-Link mal
  // nicht direkt anklickbar ist (Web-Client ohne Telegram-App).
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return accessDenied(auth);

  const projectId = req.nextUrl.searchParams.get('projectId') ?? '';
  const owner = await assertProjectOwner(supabase, auth.userId, projectId);
  if (!owner.ok) return accessDenied(owner);

  const { data, error } = await supabase
    .from('bernd_channel_links')
    .select('chat_id, pairing_code, verified_at')
    .eq('project_id', projectId)
    .eq('channel', 'telegram')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Pairing-Status konnte nicht geladen werden' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ linked: false });
  }
  if (data.verified_at) {
    return NextResponse.json({ linked: true, chat_id: data.chat_id as string });
  }
  return NextResponse.json({ linked: false, code: (data.pairing_code as string | null) ?? undefined });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return accessDenied(auth);

  const body = await req.json().catch(() => ({}));
  const { projectId } = body as { projectId?: string };

  const owner = await assertProjectOwner(supabase, auth.userId, projectId ?? '');
  if (!owner.ok) return accessDenied(owner);

  // Bereits verbunden? Kein neuer Code nötig — idempotent zurückgeben.
  const { data: existing } = await supabase
    .from('bernd_channel_links')
    .select('chat_id, pairing_code, verified_at')
    .eq('project_id', projectId)
    .eq('channel', 'telegram')
    .maybeSingle();

  if (existing?.verified_at) {
    return NextResponse.json({ linked: true, chat_id: existing.chat_id as string });
  }

  const code = generatePairingCode();

  if (existing) {
    const { error: updateError } = await supabase
      .from('bernd_channel_links')
      .update({ pairing_code: code, verified_at: null })
      .eq('project_id', projectId as string)
      .eq('channel', 'telegram');
    if (updateError) {
      return NextResponse.json({ error: 'Pairing-Code konnte nicht erneuert werden' }, { status: 500 });
    }
    return NextResponse.json({ linked: false, code });
  }

  // Neue, noch unverifizierte Zeile — chat_id ist erst nach dem ersten `/start <code>` bekannt,
  // daher hier ein leerer Platzhalter (verifyPairing in lib/bernd/channel.ts setzt sie final).
  const { error: insertError } = await supabase.from('bernd_channel_links').insert({
    user_id: auth.userId,
    project_id: projectId,
    channel: 'telegram',
    chat_id: `pending_${projectId}`,
    pairing_code: code,
    verified_at: null,
  });
  if (insertError) {
    return NextResponse.json({ error: 'Pairing-Code konnte nicht angelegt werden' }, { status: 500 });
  }

  return NextResponse.json({ linked: false, code });
}
