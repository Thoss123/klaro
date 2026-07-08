import { NextRequest, NextResponse } from 'next/server';
import { resolveCaller } from '@/lib/machine-auth';

/**
 * Agent Pending Actions API — Zustand des WhatsApp-Steuerkanals.
 * Bedient App-UI (Cookie) und n8n (Bearer-Token).
 *
 * GET   /api/agent/pending?project_id=..&contact=whatsapp:+49..&status=pending
 *         → { action }  (neueste passende oder null) — Inbound-Flow prüft: offene Freigabe?
 * POST  /api/agent/pending  { project_id, contact, payload, channel?, kind? }
 *         → { action }  — Flow 1 legt einen Entwurf zur Freigabe an
 * PATCH /api/agent/pending  { id, project_id, status?, payload? }
 *         → { action }  — Freigabe ('sent'), Abbruch ('cancelled') oder Revision (payload)
 */

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('project_id');
  const caller = await resolveCaller(req, projectId);
  if ('error' in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 });

  const contact = req.nextUrl.searchParams.get('contact');
  const status = req.nextUrl.searchParams.get('status') ?? 'pending';
  if (!contact) return NextResponse.json({ error: 'contact required' }, { status: 400 });

  const { data } = await caller.supabase
    .from('agent_pending_actions')
    .select('*')
    .eq('project_id', projectId)
    .eq('contact', contact)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ action: data ?? null });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { project_id, contact, payload, channel, kind } = body as {
    project_id?: string;
    contact?: string;
    payload?: unknown;
    channel?: string;
    kind?: string;
  };

  const caller = await resolveCaller(req, project_id ?? null);
  if ('error' in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!project_id || !contact) {
    return NextResponse.json({ error: 'project_id, contact required' }, { status: 400 });
  }

  const { data, error } = await caller.supabase
    .from('agent_pending_actions')
    .insert({
      user_id: caller.userId,
      project_id,
      contact,
      channel: channel ?? 'whatsapp',
      kind: kind ?? 'draft_approval',
      payload: payload ?? {},
      status: 'pending',
    })
    .select()
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 });
  return NextResponse.json({ action: data });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id, project_id, status, payload } = body as {
    id?: string;
    project_id?: string;
    status?: string;
    payload?: unknown;
  };

  const caller = await resolveCaller(req, project_id ?? null);
  if ('error' in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!id || !project_id) return NextResponse.json({ error: 'id and project_id required' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof status === 'string') patch.status = status;
  if (payload !== undefined) patch.payload = payload;

  const { data, error } = await caller.supabase
    .from('agent_pending_actions')
    .update(patch)
    .eq('id', id)
    .eq('project_id', project_id)
    .select()
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'update failed' }, { status: 500 });
  return NextResponse.json({ action: data });
}
