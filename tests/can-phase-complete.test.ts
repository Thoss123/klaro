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
    phase: 'plan',
  };

  it('blocks plan when pain point missing workflow', () => {
    expect(canAdvanceFromPhase('plan', canvas).ok).toBe(false);
  });

  it('allows plan when coach signaled complete with at least one workflow', () => {
    expect(canAdvanceFromPhase('plan', canvas, { coachSignaledComplete: true }).ok).toBe(true);
  });
});
