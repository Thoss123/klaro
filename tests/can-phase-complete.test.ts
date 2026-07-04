import { describe, it, expect } from 'vitest';
import { canAdvanceFromPhase } from '@/lib/can-phase-complete';
import type { CanvasData } from '@/lib/types';

describe('canAdvanceFromPhase', () => {
  const canvas: CanvasData = {
    pain_points: [
      { id: 'pp_1', title: 'A', description: '', priority: 'hoch' },
      { id: 'pp_2', title: 'B', description: '', priority: 'hoch' },
    ],
    use_cases: [],
    workflows: [
      {
        id: 'w1',
        title: 'Flow A',
        linked_pain_point: 'pp_1',
        steps: [{ id: 's1', label: 'Start', type: 'trigger' }],
      },
    ],
    documents: [],
    phase: 'analyse',
  };

  it('blocks analyse (merged) when pain point missing workflow', () => {
    expect(canAdvanceFromPhase('analyse', canvas).ok).toBe(false);
  });

  it('allows analyse when coach signaled complete with at least one workflow', () => {
    expect(canAdvanceFromPhase('analyse', canvas, { coachSignaledComplete: true }).ok).toBe(true);
  });

  it('blocks diagnose without any pain point (Türsteher)', () => {
    const empty: CanvasData = { ...canvas, pain_points: [] };
    const gate = canAdvanceFromPhase('diagnose', empty);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toBe('no_pain_points');
  });

  it('allows diagnose with at least one titled pain point', () => {
    expect(canAdvanceFromPhase('diagnose', canvas).ok).toBe(true);
  });
});
