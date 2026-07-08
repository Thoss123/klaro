import type { SupabaseClient, User } from '@supabase/supabase-js';

/** Comma-separated allowlist from ADMIN_EMAILS (lowercased). Empty = no allowlist. */
export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Returns the logged-in user iff they may use the admin area, else null.
 * - Not logged in → null.
 * - ADMIN_EMAILS set → only those emails pass.
 * - ADMIN_EMAILS unset → any authenticated user passes (so a fresh setup isn't locked out).
 */
export async function getAdminUser(supabase: SupabaseClient): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const allow = getAdminEmails();
  if (allow.length === 0) {
    if (process.env.NODE_ENV === 'production') return null;
    return user;
  }
  return allow.includes((user.email || '').toLowerCase()) ? user : null;
}
