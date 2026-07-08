import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AccessResult =
  | { ok: true; userId: string }
  | { ok: false; status: 400 | 401 | 403 | 404; error: string };

/** Returns the authenticated user id or 401. */
export async function requireUser(supabase: SupabaseClient): Promise<AccessResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true, userId: user.id };
}

/** Ensures the user owns the project. Returns 403/404 on failure. */
export async function assertProjectOwner(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<AccessResult> {
  if (!projectId?.trim()) {
    return { ok: false, status: 400, error: 'project_id required' };
  }
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { ok: false, status: 403, error: 'Forbidden' };
  if (!data) return { ok: false, status: 403, error: 'Forbidden' };
  return { ok: true, userId };
}

/** Ensures the session belongs to the user. Returns 403/404 on failure. */
export async function assertSessionOwner(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<AccessResult> {
  if (!sessionId?.trim()) {
    return { ok: false, status: 400, error: 'sessionId required' };
  }
  const { data, error } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { ok: false, status: 403, error: 'Forbidden' };
  if (!data) return { ok: false, status: 403, error: 'Forbidden' };
  return { ok: true, userId };
}

/** Converts a failed AccessResult into a JSON NextResponse. */
export function accessDenied(result: Extract<AccessResult, { ok: false }>): NextResponse {
  return NextResponse.json({ error: result.error }, { status: result.status });
}
