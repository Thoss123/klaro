import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createSupabaseServiceClient } from '@/lib/supabase';

/**
 * Auth für Endpunkte, die BEIDE Aufrufer bedienen:
 *  - die App-UI (eingeloggter User, Cookie-Session → Anon-Client + RLS)
 *  - n8n-Workflows (Maschine ohne Session → Service-Client + Bearer-Token)
 *
 * n8n schickt `Authorization: Bearer <WORKSPACE_API_TOKEN>`. Der User wird dann NICHT
 * vom Aufrufer übernommen, sondern autoritativ aus dem Projekt-Eigentümer abgeleitet —
 * so kann ein Maschinen-Aufruf nur auf Daten des Projekt-Owners wirken.
 */

/** True, wenn der Request den gültigen Maschinen-Token trägt. */
export function hasMachineToken(req: NextRequest): boolean {
  const token = process.env.WORKSPACE_API_TOKEN?.trim();
  if (!token) return false;
  const auth = req.headers.get('authorization') ?? '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return bearer.length > 0 && bearer === token;
}

export type ResolvedCaller =
  | { supabase: SupabaseClient; userId: string }
  | { error: string; status: number };

/**
 * Löst den Aufrufer auf. Für Maschinen-Aufrufe wird `projectId` gebraucht, um den
 * Owner (user_id) aus `projects` zu bestimmen.
 */
export async function resolveCaller(
  req: NextRequest,
  projectId: string | null,
): Promise<ResolvedCaller> {
  if (hasMachineToken(req)) {
    if (!projectId) return { error: 'project_id required', status: 400 };
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', projectId)
      .maybeSingle();
    const ownerId = data?.user_id as string | undefined;
    if (!ownerId) return { error: 'project not found', status: 404 };
    return { supabase, userId: ownerId };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 };
  return { supabase, userId: user.id };
}
