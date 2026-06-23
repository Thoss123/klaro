/**
 * OAuth-Provider-Registry — Google, Microsoft (Meta folgt später).
 *
 * Zentrale Single-Source-of-Truth für den per-User-OAuth-Flow:
 *  - welche Scopes angefragt werden,
 *  - welche n8n-Credential-Typen ein Provider abdeckt (gmailOAuth2, …),
 *  - wie aus der Token-Antwort das n8n-`data`-Objekt gebaut wird.
 *
 * n8n speichert OAuth2-Tokens im Feld `oauthTokenData` innerhalb von `data`.
 * Legt man ein Credential per API mit bereits befülltem `oauthTokenData` an,
 * gilt es in n8n sofort als "verbunden" — kein Klick in der n8n-UI nötig.
 *
 * Auth läuft IMMER über Axantilos zentrale OAuth-Apps (eine pro Provider).
 * Der User wählt nur sein Konto + bestätigt — er legt nie eigene Clients an.
 */

export type OAuthProvider = 'google' | 'microsoft' | 'meta';

/** Roh-Token-Antwort eines Providers (Felder je nach Anbieter optional). */
export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

/** Was n8n im Credential-`data` für einen OAuth2-Typ erwartet. */
export interface N8nOAuthCredentialData {
  clientId: string;
  clientSecret: string;
  oauthTokenData: {
    access_token: string;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
    expires_in?: number;
    expiry_date?: number;
  };
  [key: string]: unknown;
}

interface ProviderConfig {
  /** Menschlich lesbarer Name für die UI ("Google", "Microsoft"). */
  label: string;
  authUrl: () => string;
  tokenUrl: () => string;
  /** Superset aller Scopes — ein Login deckt alle Tools des Providers ab. */
  scopes: string[];
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
  /** Zusätzliche Query-Params für die Auth-URL (z. B. Google offline/consent). */
  extraAuthParams?: Record<string, string>;
  /** Ordnet n8n-Credential-Typ → diesen Provider zu (Prefix/Match-Funktion). */
  matchesCredentialType: (credentialType: string) => boolean;
  /** Baut das n8n-`data`-Objekt aus der Token-Antwort. */
  buildCredentialData: (tokens: OAuthTokenResponse) => N8nOAuthCredentialData;
}

import { envAppOrigin } from '@/lib/app-origin';

/** n8n-Katalog liefert teils prefixed Namen (z. B. n8n-nodes-base.gmailOAuth2). */
export function normalizeCredentialTypeName(credentialType?: string | null): string {
  if (!credentialType) return '';
  const dot = credentialType.lastIndexOf('.');
  return dot >= 0 ? credentialType.slice(dot + 1) : credentialType;
}

/** Die in Google/Microsoft-Console zu registrierende Callback-URL. */
export function oauthRedirectUri(provider: OAuthProvider, origin?: string): string {
  const base = (origin ?? envAppOrigin()).replace(/\/$/, '');
  return `${base}/api/oauth/callback/${provider}`;
}

function withExpiry(tokens: OAuthTokenResponse) {
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope,
    token_type: tokens.token_type ?? 'Bearer',
    expires_in: tokens.expires_in,
    // n8n nutzt expiry_date (ms-Timestamp) für den automatischen Refresh.
    expiry_date: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
  };
}

export const OAUTH_PROVIDERS: Record<OAuthProvider, ProviderConfig> = {
  google: {
    label: 'Google',
    authUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: () => 'https://oauth2.googleapis.com/token',
    // Ein Login deckt Gmail, Sheets, Docs, Drive, Calendar, YouTube ab.
    scopes: [
      'openid',
      'email',
      'profile',
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.upload',
    ],
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    // access_type=offline + prompt=consent → zuverlässig ein refresh_token.
    extraAuthParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    // Nur echte OAuth2-Typen — googleApi (Service Account) und googlePalmApi (Gemini API-Key) ausnehmen.
    matchesCredentialType: (t) =>
      (t.startsWith('gmail') && /oauth/i.test(t)) ||
      (t.startsWith('google') && /oauth/i.test(t)) ||
      t.toLowerCase().startsWith('youtube'),
    buildCredentialData: (tokens) => ({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      oauthTokenData: withExpiry(tokens),
    }),
  },

  microsoft: {
    label: 'Microsoft',
    authUrl: () =>
      `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}/oauth2/v2.0/authorize`,
    tokenUrl: () =>
      `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}/oauth2/v2.0/token`,
    // Superset für Outlook, Teams, OneDrive, Excel, To Do — ein Login für alle Microsoft-Nodes.
    scopes: [
      'openid',
      'email',
      'profile',
      'offline_access',
      'User.Read',
      'User.Read.All',
      'Contacts.Read',
      'Contacts.ReadWrite',
      'Calendars.Read',
      'Calendars.Read.Shared',
      'Calendars.ReadWrite',
      'Mail.ReadWrite',
      'Mail.ReadWrite.Shared',
      'Mail.Send',
      'Mail.Send.Shared',
      'MailboxSettings.Read',
      'Files.ReadWrite.All',
      'Chat.ReadWrite',
      'Chat.ReadWrite.All',
      'ChannelMessage.Send',
      'ChannelMessage.Read.All',
      'Group.ReadWrite.All',
      'Team.ReadBasic.All',
    ],
    clientId: () => process.env.MICROSOFT_CLIENT_ID,
    clientSecret: () => process.env.MICROSOFT_CLIENT_SECRET,
    extraAuthParams: { response_mode: 'query', prompt: 'select_account' },
    // Nur OAuth2 — microsoftSql / Shared-Key-Credentials ausnehmen.
    matchesCredentialType: (t) =>
      t.toLowerCase().startsWith('microsoft') && /oauth/i.test(t),
    buildCredentialData: (tokens) => {
      const tenant = process.env.MICROSOFT_TENANT_ID || 'common';
      return {
        clientId: process.env.MICROSOFT_CLIENT_ID ?? '',
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
        grantType: 'authorizationCode',
        authUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
        accessTokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        authQueryParameters: 'response_mode=query&prompt=select_account',
        authentication: 'body',
        graphApiBaseUrl: 'https://graph.microsoft.com',
        oauthTokenData: withExpiry(tokens),
      };
    },
  },

  // Meta/Facebook: anderer Flow (long-lived Access-Token, kein refresh).
  // Wird aktiviert, sobald die Meta-App + Business-Verifizierung steht.
  meta: {
    label: 'Meta',
    authUrl: () => 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: () => 'https://graph.facebook.com/v21.0/oauth/access_token',
    scopes: [
      'pages_show_list',
      'pages_manage_posts',
      'pages_read_engagement',
      'instagram_basic',
      'instagram_content_publish',
    ],
    clientId: () => process.env.META_APP_ID,
    clientSecret: () => process.env.META_APP_SECRET,
    matchesCredentialType: (t) => t.toLowerCase().startsWith('facebook'),
    // Meta legt das Token direkt unter accessToken ab (facebookGraphApi-Credential).
    buildCredentialData: (tokens) => ({
      clientId: process.env.META_APP_ID ?? '',
      clientSecret: process.env.META_APP_SECRET ?? '',
      accessToken: tokens.access_token,
      oauthTokenData: withExpiry(tokens),
    }),
  },
};

/** Liefert den OAuth-Provider für einen n8n-Credential-Typ — oder null (API-Key-Tool). */
export function providerForCredentialType(credentialType?: string | null): OAuthProvider | null {
  const normalized = normalizeCredentialTypeName(credentialType);
  if (!normalized) return null;
  for (const [provider, cfg] of Object.entries(OAUTH_PROVIDERS) as [OAuthProvider, ProviderConfig][]) {
    if (cfg.matchesCredentialType(normalized)) return provider;
  }
  return null;
}

export function isOAuthCredentialType(credentialType?: string | null): boolean {
  return providerForCredentialType(credentialType) !== null;
}

/** Fallback: OAuth-Provider aus n8n-Node-Typ (z. B. n8n-nodes-base.microsoftOutlook). */
export function providerForN8nNode(n8nType?: string | null): OAuthProvider | null {
  if (!n8nType) return null;
  const short = (normalizeCredentialTypeName(n8nType) || n8nType.split('.').pop() || '').toLowerCase();
  if (!short) return null;
  if (short === 'gmail' || short.startsWith('google') || short.startsWith('youtube')) {
    if (short.includes('palm')) return null;
    return 'google';
  }
  if (short.startsWith('microsoft')) return 'microsoft';
  return null;
}

/** Credential-Typ oder Node-Typ → OAuth-Provider. */
export function resolveOAuthProvider(
  credentialType?: string | null,
  n8nType?: string | null,
): OAuthProvider | null {
  return providerForCredentialType(credentialType) ?? providerForN8nNode(n8nType);
}
