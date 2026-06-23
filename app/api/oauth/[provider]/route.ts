import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { OAUTH_PROVIDERS, oauthRedirectUri, type OAuthProvider } from '@/lib/oauth-config';

export const OAUTH_STATE_COOKIE = 'axantilo_oauth_state';

/**
 * GET /api/oauth/[provider]?project_id=…&tool_name=…&n8n_credential_type=…&return_url=…
 *
 * Startet den per-User-OAuth-Flow: setzt ein CSRF-State-Cookie und leitet zur
 * Consent-Seite des Providers (Google/Microsoft) weiter. Die zentrale OAuth-App
 * von Axantilo wird genutzt — der User wählt nur sein Konto + bestätigt.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerParam } = await params;
  const provider = providerParam as OAuthProvider;
  const cfg = OAUTH_PROVIDERS[provider];
  if (!cfg) {
    return NextResponse.json({ error: `Unbekannter Provider: ${providerParam}` }, { status: 400 });
  }

  const clientId = cfg.clientId();
  const clientSecret = cfg.clientSecret();
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: `${cfg.label}-OAuth ist nicht konfiguriert (Client-ID/Secret fehlen in den Env-Vars).` },
      { status: 500 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const projectId = sp.get('project_id') || '';
  const toolName = sp.get('tool_name') || '';
  const credentialType = sp.get('n8n_credential_type') || '';
  const returnUrl = sp.get('return_url') || '/';
  if (!toolName || !credentialType) {
    return NextResponse.json({ error: 'tool_name und n8n_credential_type erforderlich' }, { status: 400 });
  }

  const state = randomUUID();

  const authUrl = new URL(cfg.authUrl());
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', oauthRedirectUri(provider));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', cfg.scopes.join(' '));
  authUrl.searchParams.set('state', state);
  for (const [k, v] of Object.entries(cfg.extraAuthParams ?? {})) {
    authUrl.searchParams.set(k, v);
  }

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set(
    OAUTH_STATE_COOKIE,
    JSON.stringify({ state, userId: user.id, projectId, toolName, credentialType, returnUrl }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600, // 10 Minuten
    },
  );
  return res;
}
