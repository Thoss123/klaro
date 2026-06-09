import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getAdminUser } from '@/lib/admin-auth';

/** GET /api/admin/knowledge — list all knowledge_base entries (overview). */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const admin = await getAdminUser(supabase);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('knowledge_base')
    .select('id, source_type, title, filepath, metadata, is_active, indexed_at')
    .order('source_type', { ascending: true })
    .order('title', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}

/** DELETE /api/admin/knowledge?id=... — remove one entry. */
export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const admin = await getAdminUser(supabase);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase.from('knowledge_base').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
