import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { planEdgesToWorkflowEdges } from '@/lib/workflow-expand';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { project_id, title, description, pain_point_id, steps, edges, plan_id } = body;

    if (!project_id || !pain_point_id || !steps) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    
    const { data: canvasRow, error: fetchError } = await supabase
      .from('project_canvas')
      .select('data')
      .eq('project_id', project_id)
      .single();

    if (fetchError || !canvasRow) {
      console.error('[create-plan] fetch error', fetchError);
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    type PlanWorkflow = { id?: string; title?: string; linked_pain_point?: string } & Record<string, unknown>;
    type PlanStepInput = { label?: string; type?: string; tool?: string; description?: string };
    const canvas = (canvasRow.data || {}) as { workflows?: PlanWorkflow[] } & Record<string, unknown>;
    // In der gemergten Analyse leben die Pläne im `workflows`-Array.
    const workflows: PlanWorkflow[] = canvas.workflows || [];

    // Ein Pain Point darf MEHRERE Pläne haben (Struktur-Lösungen). Update-Ziel:
    // 1) explizite plan_id, 2) Plan desselben Punkts mit gleichem Titel
    // (Korrektur-Flow), sonst neuen Plan anlegen. Bewusst KEIN pauschales
    // Überschreiben des einzigen Plans mehr — das würde zweite Pläne killen.
    const normTitle = (t: unknown) => String(t || '').trim().toLowerCase();
    let existingIndex = -1;
    if (plan_id) {
      existingIndex = workflows.findIndex((p) => p.id === plan_id);
    }
    if (existingIndex < 0 && title) {
      existingIndex = workflows.findIndex(
        (p) => p.linked_pain_point === pain_point_id && normTitle(p.title) === normTitle(title),
      );
    }
    const planId =
      existingIndex >= 0 && workflows[existingIndex].id ? workflows[existingIndex].id : `wf_${Date.now()}`;

    const formattedSteps = (steps as PlanStepInput[]).map((s, idx: number) => ({
      id: `step_${idx + 1}`,
      label: s.label,
      type: s.type,
      tool: s.tool || '',
      description: s.description || ''
    }));

    // Coach-Edges (optional) → echte WorkflowEdges anhand der gerade vergebenen Schritt-IDs.
    const planEdges = planEdgesToWorkflowEdges(edges, formattedSteps);

    const newPlan = {
      id: planId,
      linked_pain_point: pain_point_id,
      title: title || 'Neuer Workflow',
      description: description || '',
      steps: formattedSteps,
      ...(planEdges ? { edges: planEdges } : {}),
    };

    if (existingIndex >= 0) {
      workflows[existingIndex] = newPlan;
    } else {
      workflows.push(newPlan);
    }

    canvas.workflows = workflows;

    const { error: updateError } = await supabase
      .from('project_canvas')
      .update({ data: canvas, updated_at: new Date().toISOString() })
      .eq('project_id', project_id);

    if (updateError) {
      console.error('[create-plan] update error', updateError);
      return NextResponse.json({ error: 'Failed to update canvas' }, { status: 500 });
    }

    return NextResponse.json({ success: true, plan_id: planId });
  } catch (error: unknown) {
    console.error('[create-plan] error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
