/** Comma-separated email allowlist for closed test phases. */
export function getAuthAllowedEmails(): string[] {
  return (process.env.AUTH_ALLOWED_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAuthAllowlistEnforced(): boolean {
  return getAuthAllowedEmails().length > 0;
}

export function isEmailAllowedForAuth(email: string | null | undefined): boolean {
  const allow = getAuthAllowedEmails();
  if (allow.length === 0) return true;
  const normalized = (email || '').trim().toLowerCase();
  return Boolean(normalized && allow.includes(normalized));
}

export const AUTH_ALLOWLIST_MESSAGE =
  'Die Testphase ist aktuell geschlossen. Melde dich bitte mit der freigegebenen E-Mail-Adresse an.';
