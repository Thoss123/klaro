import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { mergeWorkflowPlanIntoCanvas } from '@/lib/merge-workflow-plan';
import type { CanvasData } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { project_id, title, description, pain_point_id, steps, edges, plan_id } = body;

    if (!project_id || !pain_point_id || !steps) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', project_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!project) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: canvasRow, error: fetchError } = await supabase
      .from('project_canvas')
      .select('data')
      .eq('project_id', project_id)
      .single();

    if (fetchError || !canvasRow) {
      console.error('[create-plan] fetch error', fetchError);
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const canvas = (canvasRow.data || {}) as CanvasData;
    const merged = mergeWorkflowPlanIntoCanvas(canvas, {
      title,
      description,
      pain_point_id,
      steps,
      edges,
      plan_id,
    });

    if (!merged) {
      return NextResponse.json({ error: 'Invalid plan payload' }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('project_canvas')
      .update({ data: merged.canvas, updated_at: new Date().toISOString() })
      .eq('project_id', project_id);

    if (updateError) {
      console.error('[create-plan] update error', updateError);
      return NextResponse.json({ error: 'Failed to update canvas' }, { status: 500 });
    }

    return NextResponse.json({ success: true, plan_id: merged.planId });
  } catch (error: unknown) {
    console.error('[create-plan] error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
