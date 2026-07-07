import { planEdgesToWorkflowEdges } from '@/lib/workflow-expand';
import type { CanvasData, Workflow, WorkflowStep } from '@/lib/types';

export type WorkflowPlanInput = {
  title?: string;
  description?: string;
  pain_point_id?: string;
  plan_id?: string;
  steps?: Array<{ label?: string; type?: string; tool?: string; description?: string }>;
  edges?: unknown;
};

function normTitle(t: unknown): string {
  return String(t || '').trim().toLowerCase();
}

/** Merge a coach `<workflow_plan>` into canvas — analyse plans live in `workflow_plans`. */
export function mergeWorkflowPlanIntoCanvas(
  canvas: CanvasData,
  plan: WorkflowPlanInput,
): { canvas: CanvasData; planId: string } | null {
  if (!plan.pain_point_id || !Array.isArray(plan.steps) || plan.steps.length === 0) return null;

  const existingPlans = [...(canvas.workflow_plans ?? []), ...(canvas.workflows ?? [])];
  const byId = new Map<string, Workflow>();
  for (const w of existingPlans) {
    if (w?.id) byId.set(w.id, w);
  }

  let existingIndex = -1;
  if (plan.plan_id) {
    existingIndex = existingPlans.findIndex(p => p.id === plan.plan_id);
  }
  if (existingIndex < 0 && plan.title) {
    existingIndex = existingPlans.findIndex(
      p => p.linked_pain_point === plan.pain_point_id && normTitle(p.title) === normTitle(plan.title),
    );
  }

  const planId =
    existingIndex >= 0 && existingPlans[existingIndex]?.id
      ? existingPlans[existingIndex].id
      : `wf_${Date.now()}`;

  const formattedSteps: WorkflowStep[] = plan.steps.map((s, idx) => ({
    id: `step_${idx + 1}`,
    label: s.label || '',
    type: (s.type || 'action') as WorkflowStep['type'],
    tool: s.tool || '',
    ...(s.description ? { note: s.description } : {}),
  }));

  const planEdges = planEdgesToWorkflowEdges(plan.edges, formattedSteps);

  const newPlan: Workflow = {
    id: planId,
    linked_pain_point: plan.pain_point_id,
    title: plan.title || 'Neuer Workflow',
    steps: formattedSteps,
    ...(planEdges ? { edges: planEdges } : {}),
  };

  byId.set(planId, newPlan);
  const mergedPlans = [...byId.values()];

  return {
    canvas: {
      ...canvas,
      workflow_plans: mergedPlans,
      // Legacy/analyse: keep workflows in sync so older readers still see plans.
      workflows: mergedPlans,
    },
    planId,
  };
}
