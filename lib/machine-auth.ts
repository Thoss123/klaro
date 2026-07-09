import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createSupabaseServiceClient } from '@/lib/supabase';
import { assertProjectOwner, requireUser } from '@/lib/access-control';

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
  const userResult = await requireUser(supabase);
  if (!userResult.ok) return { error: userResult.error, status: userResult.status };

  if (projectId) {
    const ownerResult = await assertProjectOwner(supabase, userResult.userId, projectId);
    if (!ownerResult.ok) return { error: ownerResult.error, status: ownerResult.status };
  }

  return { supabase, userId: userResult.userId };
}

/** Zeitkonstanter String-Vergleich (verhindert Timing-Angriffe auf den Token-Teil). */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Trotzdem eine Vergleichsoperation ausführen, damit die Länge nicht über die
    // Laufzeit verraten wird (Vergleich gegen sich selbst — Ergebnis wird verworfen).
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Auth für die OpenAI-kompatiblen Proxy-Routen (`/api/agent/v1/*`), die n8n über eine
 * `openAiApi`-Credential mit custom Base-URL anspricht. n8n schickt dabei NUR
 * `Authorization: Bearer <apiKey>` — kein separates project_id-Feld im Body (OpenAI-Format
 * lässt dafür keinen Platz). Der API-Key kodiert das Projekt daher im Key selbst:
 *
 *   <WORKSPACE_API_TOKEN>.<project_id>
 *
 * Split am LETZTEN "." — project_id ist eine UUID (enthält keine Punkte), der Token-Teil
 * davor darf beliebige Zeichen enthalten. Der Owner (user_id) wird wie bei resolveCaller
 * autoritativ aus dem Projekt abgeleitet, nie vom Aufrufer übernommen.
 */
export async function resolveOpenAiCaller(req: NextRequest): Promise<ResolvedCaller> {
  const expectedToken = process.env.WORKSPACE_API_TOKEN?.trim();
  if (!expectedToken) return { error: 'WORKSPACE_API_TOKEN not configured', status: 500 };

  const auth = req.headers.get('authorization') ?? '';
  const apiKey = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!apiKey) return { error: 'Missing bearer token', status: 401 };

  const splitAt = apiKey.lastIndexOf('.');
  if (splitAt <= 0 || splitAt === apiKey.length - 1) {
    return { error: 'Malformed API key (expected <token>.<project_id>)', status: 401 };
  }
  const tokenPart = apiKey.slice(0, splitAt);
  const projectId = apiKey.slice(splitAt + 1);

  if (!timingSafeEqualStrings(tokenPart, expectedToken)) {
    return { error: 'Invalid API key', status: 401 };
  }

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
