import { isValidWorkflow } from '@/lib/canvas-normalize';
import type { CanvasData } from '@/lib/types';

/** Gate phase_complete tags — canvas + phase-specific requirements. */
export function canAdvanceFromPhase(
  phase: string,
  canvas: CanvasData,
  opts?: { coachSignaledComplete?: boolean },
): { ok: boolean; reason?: string } {
  // Türsteher-Prinzip (coach/config/phases.json): Phasen-Gates prüft Code,
  // nicht das Modell. Ohne mindestens eine konkret erfasste potenzielle
  // Verbesserung gibt es nichts zu analysieren — Übergang ablehnen.
  if (phase === 'diagnose') {
    const painPoints = (canvas.pain_points || []).filter(p => !!p.title?.trim());
    if (painPoints.length === 0) {
      return { ok: false, reason: 'no_pain_points' };
    }
  }

  // Gemergte Phase 2 (Analyse & Plan): ohne mindestens einen validen
  // Workflow-Plan gibt es nichts umzusetzen — Übergang ablehnen.
  if (phase === 'analyse' || phase === 'plan') {
    const workflows = (canvas.workflows || []).filter(isValidWorkflow);
    if (workflows.length === 0) {
      return { ok: false, reason: 'no_workflows' };
    }
    // Coach hat phase_complete gesendet — Nutzer darf weiter, auch wenn nicht jeder PP verlinkt ist.
    if (opts?.coachSignaledComplete) {
      return { ok: true };
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
