import { NextRequest, NextResponse } from 'next/server';
import { getRequestOrigin } from '@/lib/app-origin';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { encrypt } from '@/lib/encryption';
import { createN8nCredential } from '@/lib/n8n';
import {
  OAUTH_PROVIDERS,
  oauthRedirectUri,
  type OAuthProvider,
  type OAuthTokenResponse,
} from '@/lib/oauth-config';
import { OAUTH_STATE_COOKIE } from '../../[provider]/route';

/** Validates return paths — same-origin relative paths only. */
function safeReturnPath(returnUrl: string): string {
  const trimmed = returnUrl.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/';
  return trimmed;
}

/** Kleine HTML-Seite: meldet dem Opener-Fenster das Ergebnis und schließt sich. */
function popupResultPage(
  payload: Record<string, unknown>,
  fallbackUrl: string,
  targetOrigin: string,
): NextResponse {
  const json = JSON.stringify(payload);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Verbinden…</title></head>
<body style="font-family:system-ui;padding:2rem;text-align:center;color:#444">
<p>${payload.ok ? 'Verbunden ✓ Du kannst dieses Fenster schließen.' : 'Verbindung fehlgeschlagen.'}</p>
<script>
  (function () {
    var msg = Object.assign({ type: 'axantilo_oauth' }, ${json});
    var origin = ${JSON.stringify(targetOrigin)};
    try { if (window.opener) { window.opener.postMessage(msg, origin); window.close(); return; } } catch (e) {}
    var u = ${JSON.stringify(fallbackUrl)};
    window.location.replace(u);
  })();
</script>
</body></html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/** Tauscht den Authorization-Code gegen Tokens (OAuth2 Authorization-Code-Flow). */
async function exchangeCode(
  provider: OAuthProvider,
  code: string,
  origin: string,
): Promise<OAuthTokenResponse> {
  const cfg = OAUTH_PROVIDERS[provider];
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId() ?? '',
    client_secret: cfg.clientSecret() ?? '',
    redirect_uri: oauthRedirectUri(provider, origin),
    grant_type: 'authorization_code',
  });
  const res = await fetch(cfg.tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Token-Exchange ${res.status}: ${text}`);
  return JSON.parse(text) as OAuthTokenResponse;
}

/**
 * GET /api/oauth/callback/[provider]?code=…&state=…
 *
 * Provider-Redirect-Ziel: verifiziert State (CSRF), tauscht den Code gegen
 * Tokens, legt das n8n-Credential mit vorbefüllten oauthTokenData an und
 * speichert die n8n-Credential-ID in user_credentials.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerParam } = await params;
  const provider = providerParam as OAuthProvider;
  const cfg = OAUTH_PROVIDERS[provider];

  const sp = req.nextUrl.searchParams;
  const code = sp.get('code');
  const state = sp.get('state');
  const providerError = sp.get('error');

  // State-Cookie lesen (für returnUrl-Fallback brauchen wir es früh).
  const cookieRaw = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  let cookie: {
    state: string; userId: string; projectId: string;
    toolName: string; credentialType: string; returnUrl: string;
  } | null = null;
  try { cookie = cookieRaw ? JSON.parse(cookieRaw) : null; } catch { cookie = null; }

  const returnUrl = safeReturnPath(cookie?.returnUrl || '/');
  const origin = getRequestOrigin(req);
  const fail = (error: string) => {
    const res = popupResultPage(
      { ok: false, error },
      `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}oauth_error=${encodeURIComponent(error)}`,
      origin,
    );
    res.cookies.delete(OAUTH_STATE_COOKIE);
    return res;
  };

  if (!cfg) return fail(`Unbekannter Provider: ${providerParam}`);
  if (providerError) return fail(`Provider-Fehler: ${providerError}`);
  if (!code || !state) return fail('Code oder State fehlt in der Antwort.');
  if (!cookie || cookie.state !== state) return fail('Ungültiger State (CSRF-Schutz). Bitte erneut versuchen.');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== cookie.userId) return fail('Session abgelaufen. Bitte neu einloggen und erneut verbinden.');

  if (cookie.projectId) {
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', cookie.projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!project) return fail('Projekt nicht gefunden oder kein Zugriff.');
  }

  let tokens: OAuthTokenResponse;
  try {
    tokens = await exchangeCode(provider, code, origin);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Token-Exchange fehlgeschlagen.');
  }

  // n8n-Credential mit vorbefüllten Tokens anlegen → sofort "verbunden".
  let n8nCredentialId: string | null = null;
  try {
    const credType = cookie.credentialType.split('.').pop() || cookie.credentialType;
    const cred = await createN8nCredential({
      name: `${user.id.slice(0, 8)}-${cookie.toolName}`,
      type: credType,
      data: cfg.buildCredentialData(tokens),
    });
    n8nCredentialId = cred.id;
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'n8n-Credential konnte nicht angelegt werden.');
  }

  // refresh_token (oder access_token) verschlüsselt ablegen — n8n hält die Live-Tokens,
  // wir behalten eine Kopie für spätere Migration/Re-Issue.
  const encrypted_value = encrypt(tokens.refresh_token || tokens.access_token);

  const { error: upsertError } = await supabase
    .from('user_credentials')
    .upsert({
      user_id: user.id,
      project_id: cookie.projectId || null,
      tool_name: cookie.toolName,
      credential_type: 'oauth',
      encrypted_value,
      n8n_credential_id: n8nCredentialId,
      status: 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,project_id,tool_name' });

  if (upsertError) return fail(`Speichern fehlgeschlagen: ${upsertError.message}`);

  const successUrl = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}oauth_success=${encodeURIComponent(cookie.toolName)}`;
  const res = popupResultPage(
    { ok: true, provider, toolName: cookie.toolName, credentialId: n8nCredentialId },
    successUrl,
    origin,
  );
  res.cookies.delete(OAUTH_STATE_COOKIE);
  return res;
}
