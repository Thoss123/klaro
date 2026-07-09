/**
 * Central (shared) n8n credential IDs for services Axantilo hosts centrally.
 *
 * These credentials are created ONCE in n8n by the Axantilo admin and shared across
 * all user workflows. Users never configure them — the deploy route injects them
 * automatically via the credential IDs stored here.
 *
 * To use: create the credential in n8n UI, copy its numeric ID, set the env var.
 * Credential IDs are stable and don't change unless the credential is deleted + recreated.
 *
 * Credential types NOT listed here (e.g. gmailOAuth2) remain per-user — each user
 * connects their own account via the 3-click OAuth flow.
 */

/** Map of n8n credential type key → env var holding the shared credential ID. */
const CENTRAL_CRED_ENV: Record<string, string> = {
  smtp:           'N8N_CREDENTIAL_SMTP',            // Resend SMTP — all transactional email via hello@axantilo.com
  twilioApi:      'N8N_CREDENTIAL_TWILIO',          // Twilio — central number for SMS + WhatsApp-via-Twilio
  whatsAppApi:    'N8N_CREDENTIAL_WHATSAPP',        // WhatsApp Business Cloud (Meta) — if used separately
  httpHeaderAuth: 'N8N_CREDENTIAL_WORKSPACE_TOKEN', // Workspace-API-Token — Bearer für n8n→App-Calls auf /api/agent/* & /api/workspace
};

/** Returns the n8n credential ID for a central service, or undefined if not configured. */
export function centralCredentialId(credentialType: string): string | undefined {
  const envKey = CENTRAL_CRED_ENV[credentialType];
  if (!envKey) return undefined;
  const id = process.env[envKey];
  return id && id.trim() ? id.trim() : undefined;
}

/** True if this credential type is centrally managed (no per-user setup needed). */
export function isCentralCredential(credentialType: string): boolean {
  return credentialType in CENTRAL_CRED_ENV;
}

/**
 * Returns an object mapping tool_name → n8n_credential_id for all configured central credentials.
 * Merge this into credMap BEFORE the per-user lookup so central services are always present.
 */
export function buildCentralCredMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [credType, envKey] of Object.entries(CENTRAL_CRED_ENV)) {
    const id = process.env[envKey];
    if (id && id.trim()) map[credType] = id.trim();
  }
  return map;
}
