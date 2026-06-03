import { isValidWorkflow } from '@/lib/canvas-normalize';
import type { CanvasData } from '@/lib/types';

/** Gate phase_complete tags — canvas + phase-specific requirements. */
export function canAdvanceFromPhase(phase: string, canvas: CanvasData): { ok: boolean; reason?: string } {
  if (phase === 'analyse') {
    const imp = canvas.implementer;
    const who = imp?.who?.trim();
    const skill = imp?.skill_level;
    if (!who || !skill) {
      return { ok: false, reason: 'implementer_missing' };
    }
  }

  if (phase === 'plan') {
    const workflows = (canvas.workflows || []).filter(isValidWorkflow);
    if (workflows.length === 0) {
      return { ok: false, reason: 'no_workflows' };
    }
    const painIds = new Set((canvas.pain_points || []).map(p => p.id));
    if (painIds.size > 0) {
      const linked = new Set(
        workflows.map(w => w.linked_pain_point).filter((id): id is string => !!id && painIds.has(id))
      );
      if (linked.size < painIds.size) {
        return { ok: false, reason: 'pain_points_without_workflow' };
      }
    }
  }

  return { ok: true };
}
