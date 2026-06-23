const LOCAL_FALLBACK = 'http://localhost:3000';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

/** Browser: aktuelle Seiten-Origin (Prod, Preview oder localhost). */
export function getBrowserOrigin(): string {
  if (typeof window === 'undefined') return LOCAL_FALLBACK;
  return stripTrailingSlash(window.location.origin);
}

/**
 * Server: öffentliche Origin aus Request-Headers (Vercel/Proxy) oder URL.
 * Wichtig für OAuth-Redirect-URIs — nicht NEXT_PUBLIC_APP_URL aus dem Build.
 */
export function getRequestOrigin(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost?.split(',')[0]?.trim() || request.headers.get('host');
  if (host) {
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    const proto =
      forwardedProto ||
      (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    return stripTrailingSlash(`${proto}://${host}`);
  }
  return stripTrailingSlash(new URL(request.url).origin);
}

/** Supabase Auth Callback — bleibt auf derselben Domain wie der User. */
export function authCallbackUrl(origin: string, nextPath?: string): string {
  const base = `${stripTrailingSlash(origin)}/api/auth/callback`;
  const next = nextPath?.trim();
  if (!next || next === '/chat') return base;
  const path = next.startsWith('/') ? next : `/${next}`;
  return `${base}?${new URLSearchParams({ next: path }).toString()}`;
}

/** Fallback für Scripts ohne Request-Kontext (nur wenn keine Origin übergeben). */
export function envAppOrigin(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return stripTrailingSlash(env);
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return stripTrailingSlash(`https://${vercel}`);
  return LOCAL_FALLBACK;
}
