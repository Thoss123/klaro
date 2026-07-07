import type { CanvasData, Workflow } from '@/lib/types';
import { normalizePhase } from '@/lib/phases';

/** Plan-Skizzen aus der gemergten Phase 2 — not deploy-ready until built in Umsetzung. */
export function getWorkflowPlans(canvas: CanvasData): Workflow[] {
  const fromPlans = canvas.workflow_plans ?? [];
  const fromWorkflows = canvas.workflows ?? [];
  const phase = normalizePhase(canvas.phase);
  if (phase === 'analyse') {
    const byId = new Map<string, Workflow>();
    for (const w of [...fromPlans, ...fromWorkflows]) {
      if (w?.id) byId.set(w.id, w);
    }
    return [...byId.values()];
  }
  if (fromPlans.length) return fromPlans;
  return fromWorkflows;
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
