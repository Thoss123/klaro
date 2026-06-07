import type { CanvasData, Workflow } from '@/lib/types';

/** Phase-3 sketches — shown on the Plan node; not deploy-ready until built in Phase 4. */
export function getWorkflowPlans(canvas: CanvasData): Workflow[] {
  if (canvas.workflow_plans?.length) return canvas.workflow_plans;
  if (canvas.phase === 'plan') return canvas.workflows ?? [];
  return canvas.workflow_plans ?? [];
}

/** Phase-4 built workflows — shown as Deploy cards on the Umsetzung node. */
export function getBuiltWorkflows(canvas: CanvasData): Workflow[] {
  return canvas.workflows ?? [];
}

/** Move Phase-3 workflows into workflow_plans and clear live deploy list for Phase 4 entry. */
export function splitPlansForUmsetzung(canvas: CanvasData): CanvasData {
  const plans = canvas.workflow_plans?.length
    ? canvas.workflow_plans
    : (canvas.workflows ?? []);
  return {
    ...canvas,
    phase: 'umsetzung',
    workflow_plans: plans,
    workflows: [],
  };
}

/** One-time heal for projects that entered Phase 4 before plan/built split existed. */
export function healUmsetzungCanvas(canvas: CanvasData): CanvasData {
  if (canvas.phase !== 'umsetzung') return canvas;
  if (canvas.workflow_plans?.length) return canvas;
  if (!canvas.workflows?.length) return canvas;
  return splitPlansForUmsetzung(canvas);
}
