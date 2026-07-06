import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { parsePrepProgress } from '@/lib/strategy-prep';

/** Live-Fortschritt der Strategie-Vorbereitung (für Prep-UI / Polling). */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'missing_session_id' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: session, error } = await supabase
    .from('sessions')
    .select('strategy_prep_progress, project_id')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    const msg = error.message || '';
    if (msg.includes('strategy_prep_progress')) {
      return NextResponse.json({ error: 'schema_outdated', detail: msg }, { status: 503 });
    }
    console.warn('[strategy/progress] query failed:', msg);
    return NextResponse.json({ error: 'query_failed' }, { status: 500 });
  }

  if (!session) {
    return NextResponse.json({ error: 'session_not_found' }, { status: 404 });
  }

  let ready = false;
  if (session.project_id) {
    const { data: project } = await supabase
      .from('projects')
      .select('strategy')
      .eq('id', session.project_id)
      .eq('user_id', user.id)
      .maybeSingle();
    ready = !!project?.strategy?.trim();
  }

  const progress = parsePrepProgress(session.strategy_prep_progress);
  return NextResponse.json({
    progress,
    ready,
  });
}
