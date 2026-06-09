import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getAdminUser } from '@/lib/admin-auth';
import { reindexKnowledge } from '@/lib/knowledge-index';

/** POST /api/admin/knowledge/reindex — re-embed knowledge files from disk.
 *  Body: { folder?: 'tools' | 'branchen' | 'templates' | ... } (optional). */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const admin = await getAdminUser(supabase);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let folder: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.folder === 'string' && body.folder.trim()) {
      // guard against path traversal — only allow simple folder names
      folder = body.folder.replace(/[^a-z0-9/_-]/gi, '');
    }
  } catch {
    // no body → reindex everything
  }

  try {
    const result = await reindexKnowledge(supabase, folder);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'reindex failed' },
      { status: 500 },
    );
  }
}
