import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { requireUser, assertProjectOwner, accessDenied } from '@/lib/access-control';

/**
 * GET /api/bernd/approvals?projectId=<id>
 *
 * Listet `agent_pending_actions` eines Projekts fürs Dashboard-„Freigaben"-Tab
 * (Cockpit-Ausbau WP7, `components/bernd/ApprovalsView.tsx`). Die geteilte Route
 * `app/api/agent/pending` liefert bewusst nur die NEUESTE Zeile zu einem einzelnen
 * `contact` (Router-Lookup-Vertrag für den Inbound-Flow) — hier braucht das Dashboard
 * dagegen ALLE offenen + zuletzt abgeschlossenen Freigaben eines Projekts, unabhängig vom
 * Kontakt. Cookie-Auth wie `app/api/bernd/logs/route.ts` — kein n8n-Aufrufer nötig, das
 * Approve/Reject selbst läuft weiter über die bestehende `PATCH /api/agent/pending`.
 */

const LIST_LIMIT = 30;

export interface ApprovalItem {
  id: string;
  channel: string;
  contact: string;
  kind: string;
  payload: {
    subject?: string;
    draft?: string;
    mail_ref?: string;
    flow_slug?: string;
    [key: string]: unknown;
  };
  status: string;
  created_at: string;
  updated_at: string;
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return accessDenied(auth);

  const projectId = req.nextUrl.searchParams.get('projectId') ?? '';
  const owner = await assertProjectOwner(supabase, auth.userId, projectId);
  if (!owner.ok) return accessDenied(owner);

  const { data, error } = await supabase
    .from('agent_pending_actions')
    .select('id, channel, contact, kind, payload, status, created_at, updated_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    return NextResponse.json({ error: 'Freigaben konnten nicht geladen werden' }, { status: 500 });
  }

  const rows = (data ?? []) as ApprovalItem[];
  // Pending zuerst (neueste zuerst), danach abgeschlossene (ebenfalls neueste zuerst) —
  // die Zeilen kommen bereits absteigend nach created_at, wir gruppieren nur stabil um.
  const pending = rows.filter((r) => r.status === 'pending');
  const resolved = rows.filter((r) => r.status !== 'pending');

  return NextResponse.json({ items: [...pending, ...resolved] });
}
