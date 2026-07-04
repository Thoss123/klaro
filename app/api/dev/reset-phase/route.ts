import { NextRequest, NextResponse } from 'next/server';
import { stripPhaseFromCanvas } from '@/lib/phase-reset';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { CanvasData, Phase } from '@/lib/types';

const PHASES: Phase[] = ['diagnose', 'analyse', 'umsetzung'];

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Dev only' }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const phase = typeof body.phase === 'string' ? body.phase : '';
  const canvas = body.canvas as CanvasData | undefined;

  if (!sessionId || !projectId || !PHASES.includes(phase as Phase)) {
    return NextResponse.json({ error: 'sessionId, projectId and valid phase required' }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, user_id, project_id, phase')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (session.user_id !== user.id || session.project_id !== projectId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (projectError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const currentCanvas =
    canvas && typeof canvas === 'object'
      ? canvas
      : (((await supabase.from('project_canvas').select('data').eq('project_id', projectId).maybeSingle()).data
          ?.data as CanvasData | undefined) ?? {
          pain_points: [],
          use_cases: [],
          workflows: [],
          documents: [],
          phase: phase as Phase,
        });

  const resetCanvas = stripPhaseFromCanvas(
    { ...currentCanvas, phase: phase as Phase },
    phase as Phase,
  );

  // Reset räumt die gewählte Phase + alle nachgelagerten ab. 'plan' taucht als
  // Legacy-Wert noch in alten DB-Zeilen auf und wird beim Analyse-Reset mit abgeräumt.
  const clearUmsetzung = phase === 'umsetzung' || phase === 'analyse' || phase === 'diagnose';
  const clearAnalyse = phase === 'analyse' || phase === 'diagnose';
  const clearDiagnose = phase === 'diagnose';

  const phasesToClear = new Set<string>();
  if (clearDiagnose) phasesToClear.add('diagnose');
  if (clearAnalyse) {
    phasesToClear.add('analyse');
    phasesToClear.add('plan');
  }
  if (clearUmsetzung) phasesToClear.add('umsetzung');

  const phasesArray = Array.from(phasesToClear);

  // 1. Hole alle Sessions für dieses Projekt und die betroffenen Phasen
  const { data: affectedSessions, error: affectedError } = await supabase
    .from('sessions')
    .select('id, phase')
    .eq('project_id', projectId)
    .in('phase', phasesArray);

  if (affectedError) {
    return NextResponse.json({ error: affectedError.message }, { status: 500 });
  }

  const sessionIdsToClear = affectedSessions?.map(s => s.id) || [sessionId];

  // 2. Lösche Messages für alle betroffenen Sessions
  if (sessionIdsToClear.length > 0) {
    const { error: msgError } = await supabase
      .from('messages')
      .delete()
      .in('session_id', sessionIdsToClear);
    if (msgError) {
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }
  }

  // 3. Setze die angefragte Session zurück (die aktuelle)
  const { error: sessionUpdateError } = await supabase
    .from('sessions')
    .update({
      memory: null,
      welcome_sent: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (sessionUpdateError) {
    return NextResponse.json({ error: sessionUpdateError.message }, { status: 500 });
  }

  // 4. Lösche alle zukünftigen Sessions komplett
  const futureSessionIds = sessionIdsToClear.filter(id => id !== sessionId);
  if (futureSessionIds.length > 0) {
    await supabase.from('sessions').delete().in('id', futureSessionIds);
    await supabase.from('canvas').delete().in('session_id', futureSessionIds);
  }

  // 5. Lösche Memory für alle betroffenen Phasen
  if (phasesArray.length > 0) {
    const { error: memoryError } = await supabase
      .from('project_memory')
      .delete()
      .eq('project_id', projectId)
      .in('phase', phasesArray);

    if (memoryError) {
      return NextResponse.json({ error: memoryError.message }, { status: 500 });
    }
  }

  const { error: canvasError } = await supabase.from('project_canvas').upsert(
    {
      project_id: projectId,
      data: resetCanvas,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id' },
  );

  if (canvasError) {
    return NextResponse.json({ error: canvasError.message }, { status: 500 });
  }

  const { error: sessionCanvasError } = await supabase.from('canvas').upsert(
    {
      session_id: sessionId,
      data: resetCanvas,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'session_id' },
  );

  if (sessionCanvasError) {
    return NextResponse.json({ error: sessionCanvasError.message }, { status: 500 });
  }

  if (phasesArray.includes('analyse') || phasesArray.includes('umsetzung')) {
    await supabase.from('workflows').delete().eq('project_id', projectId).eq('user_id', user.id);
  }

  return NextResponse.json({ ok: true, canvas: resetCanvas });
}
