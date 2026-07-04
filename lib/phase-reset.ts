import { inferDocumentPhase } from '@/lib/canvas-normalize';
import type { CanvasData, Phase } from '@/lib/types';

export function stripPhaseFromCanvas(canvas: CanvasData, phase: Phase): CanvasData {
  const clearDiagnose = phase === 'diagnose';
  const clearAnalyse = phase === 'analyse';
  const clearUmsetzung = phase === 'umsetzung';

  const phasesToClear = new Set<Phase>([phase]);

  const documents = (canvas.documents || []).filter(d => {
    const docPhase = inferDocumentPhase(d);
    return !phasesToClear.has(docPhase);
  });

  const reset = { ...canvas, documents, phase };

  // Gemergte Phase 2 (Analyse & Plan) besitzt die Workflow-Pläne;
  // Umsetzung besitzt die gebauten Workflows.
  if (clearAnalyse || clearUmsetzung) {
    reset.workflows = [];
  }

  if (clearAnalyse) {
    reset.workflow_plans = [];
    reset.use_cases = [];
    reset.tool_evaluations = [];
    reset.solution_structures = [];
    if (reset.company) {
      reset.company = { ...reset.company, change_appetite: undefined };
    }
  }

  if (clearDiagnose) {
    reset.pain_points = [];
    reset.idea_cards = [];
    reset.company = undefined;
  }

  return reset;
}
