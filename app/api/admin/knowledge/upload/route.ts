import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createSupabaseServiceClient } from '@/lib/supabase';
import { getAdminUser } from '@/lib/admin-auth';
import { uploadAndIndex } from '@/lib/knowledge-index';

/** POST /api/admin/knowledge/upload — write pasted markdown to /knowledge/<path> and index it.
 *  Body: { filepath: string, content: string }. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const admin = await getAdminUser(supabase);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const filepath = typeof body?.filepath === 'string' ? body.filepath : '';
  const content = typeof body?.content === 'string' ? body.content : '';
  if (!filepath.trim()) return NextResponse.json({ error: 'filepath required' }, { status: 400 });
  if (!content.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 });

  try {
    const serviceSupabase = createSupabaseServiceClient();
    const entry = await uploadAndIndex(serviceSupabase, filepath, content);
    return NextResponse.json({ ok: true, entry });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'upload failed' },
      { status: 400 },
    );
  }
}
