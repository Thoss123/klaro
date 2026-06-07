import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { searchKnowledge } from '@/lib/rag';

/** POST /api/admin/knowledge/search — test the retrieval the coach would get.
 *  Body: { query: string, phase?: string }. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const query = typeof body?.query === 'string' ? body.query : '';
  const phase = typeof body?.phase === 'string' && body.phase ? body.phase : undefined;
  if (!query.trim()) return NextResponse.json({ error: 'query required' }, { status: 400 });

  try {
    const matches = await searchKnowledge({ query, phase, matchCount: 8, threshold: 0.3 });
    return NextResponse.json({ matches });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'search failed' },
      { status: 500 },
    );
  }
}
