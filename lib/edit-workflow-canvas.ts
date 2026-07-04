/**
 * Server-side: apply workflow-editor changes to project canvas (Phase 4 main chat).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { applyWorkflowEdit, type ProvidedEditStep } from '@/lib/apply-workflow-edit';
import { getBuiltWorkflows } from '@/lib/workflow-plans';
import type { CanvasData, Workflow } from '@/lib/types';

export type EditWorkflowCanvasResult =
  | { ok: true; workflow: Workflow; canvas: CanvasData; editorMessage: string; changed: boolean }
  | { ok: false; error: string; status: number };

/**
 * Wendet die vom Coach gelieferten Schritte (+ optionale Edges) auf den gebauten Workflow an
 * und speichert das Canvas. Kein zweiter LLM mehr — der Haupt-Coach hat die Schritte bereits gebaut.
 */
export async function editWorkflowOnCanvas(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  workflowId: string,
  steps: ProvidedEditStep[],
  edges?: unknown,
): Promise<EditWorkflowCanvasResult> {
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!project) return { ok: false, error: 'Project not found', status: 404 };

  const { data: row, error: loadErr } = await supabase
    .from('project_canvas')
    .select('data')
    .eq('project_id', projectId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message, status: 500 };

  const canvas = (row?.data as CanvasData | undefined) ?? {
    pain_points: [],
    use_cases: [],
    workflows: [],
    documents: [],
    phase: 'umsetzung' as const,
  };

  const built = getBuiltWorkflows(canvas);
  const workflow = built.find(w => w.id === workflowId);
  if (!workflow) {
    return { ok: false, error: 'Workflow noch nicht gebaut — zuerst build_workflow aufrufen.', status: 404 };
  }

  const result = await applyWorkflowEdit(workflow, steps, edges);

  if (!result.changed) {
    return {
      ok: true,
      workflow,
      canvas,
      editorMessage: result.message,
      changed: false,
    };
  }

  const updated: Workflow = {
    ...workflow,
    steps: result.steps,
    edges: result.edges,
  };

  const nextCanvas: CanvasData = {
    ...canvas,
    workflows: built.map(w => (w.id === workflowId ? updated : w)),
  };

  const { error: saveErr } = await supabase.from('project_canvas').upsert(
    {
      project_id: projectId,
      data: nextCanvas,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id' },
  );
  if (saveErr) return { ok: false, error: saveErr.message, status: 500 };

  return {
    ok: true,
    workflow: updated,
    canvas: nextCanvas,
    editorMessage: result.message,
    changed: true,
  };
}
