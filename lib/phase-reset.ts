import { inferDocumentPhase } from '@/lib/canvas-normalize';
import type { CanvasData, Phase } from '@/lib/types';

export function stripPhaseFromCanvas(canvas: CanvasData, phase: Phase): CanvasData {
  const clearUmsetzung = phase === 'umsetzung' || phase === 'plan' || phase === 'analyse' || phase === 'diagnose';
  const clearPlan = phase === 'plan' || phase === 'analyse' || phase === 'diagnose';
  const clearAnalyse = phase === 'analyse' || phase === 'diagnose';
  const clearDiagnose = phase === 'diagnose';

  const phasesToClear = new Set<Phase>();
  if (clearDiagnose) phasesToClear.add('diagnose');
  if (clearAnalyse) phasesToClear.add('analyse');
  if (clearPlan) phasesToClear.add('plan');
  if (clearUmsetzung) phasesToClear.add('umsetzung');
  
  const documents = (canvas.documents || []).filter(d => {
    const docPhase = inferDocumentPhase(d);
    return !phasesToClear.has(docPhase);
  });

  const reset = { ...canvas, documents, phase };

  if (clearUmsetzung) {
    reset.workflows = [];
  }

  if (clearPlan) {
    reset.workflow_plans = [];
  }

  if (clearAnalyse) {
    reset.use_cases = [];
    reset.implementer = undefined;
    if (reset.company) {
      reset.company = { ...reset.company, change_appetite: undefined };
    }
  }

  if (clearDiagnose) {
    reset.pain_points = [];
    reset.company = undefined;
  }

  return reset;
}
