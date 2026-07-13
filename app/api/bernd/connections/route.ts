import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { requireUser, assertProjectOwner, accessDenied } from '@/lib/access-control';
import { findCredentialByTool } from '@/lib/template-deploy';
import { getBerndConfig } from '@/lib/bernd/config';
import { mailToolName, resolveBerndMailProvider } from '@/lib/bernd/mail-provider';

/**
 * GET /api/bernd/connections?projectId=<id> → { email: boolean, telegram: boolean }
 *
 * Mini-Read-Route für den Setup-Chat-Seiten-Header (WP3, Aufgabe 3): liefert den live
 * Verbindungsstatus für das gewählte Postfach (`user_credentials`, via `findCredentialByTool` — dieselbe
 * Lookup-Logik wie `lib/bernd/gate.ts`/`app/api/bernd/deploy/route.ts`) und Telegram
 * (`bernd_channel_links`, verifiziert). Cookie-Auth + Projekt-Ownership wie die übrigen
 * `/api/bernd/*`-Routen. Bewusst read-only und schlank — kein neuer OAuth-/Pairing-Code,
 * nur der zusammengefasste Status für die Seite, die beide Quellen sonst separat abfragen müsste.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return accessDenied(auth);

  const projectId = req.nextUrl.searchParams.get('projectId') ?? '';
  const owner = await assertProjectOwner(supabase, auth.userId, projectId);
  if (!owner.ok) return accessDenied(owner);

  const config = await getBerndConfig(supabase, projectId);
  const emailProvider = resolveBerndMailProvider(config?.tools, config?.setup_state);
  const emailCredId = await findCredentialByTool(supabase, projectId, mailToolName(emailProvider));

  const { data: tgLink } = await supabase
    .from('bernd_channel_links')
    .select('verified_at')
    .eq('project_id', projectId)
    .eq('channel', 'telegram')
    .not('verified_at', 'is', null)
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    email: Boolean(emailCredId),
    emailProvider,
    telegram: Boolean(tgLink?.verified_at),
  });
}
