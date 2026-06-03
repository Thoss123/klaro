import { isValidWorkflow } from '@/lib/canvas-normalize';
import type { CanvasData } from '@/lib/types';

export function countValidWorkflows(canvas: Partial<CanvasData>): number {
  return (canvas.workflows || []).filter(w => isValidWorkflow(w)).length;
}

/** Kein „Workflow-Plan wartet noch“-Hinweis, wenn die Roadmap schon Workflows hat. */
export function shouldSuppressPlanWorkflowCoachNotice(
  phase: string,
  canvas: Partial<CanvasData>,
  reason?: string,
): boolean {
  if (phase !== 'plan' || countValidWorkflows(canvas) === 0) return false;
  return [
    'plan_awaiting_workflow_chat',
    'thin_user_context',
    'orchestration_deferred',
    'orchestration_blocked',
    'insufficient_context',
    'phase_advance_requested',
  ].includes(reason ?? '');
}
