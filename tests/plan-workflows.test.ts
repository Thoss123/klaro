import { describe, it, expect } from 'vitest';
import {
  countValidWorkflows,
  shouldSuppressPlanWorkflowCoachNotice,
} from '@/lib/plan-workflows';

describe('plan-workflows', () => {
  const canvasWithWf = {
    workflows: [
      {
        id: 'w1',
        title: 'Reels',
        linked_pain_point: 'pp_1',
        steps: [{ id: 's1', label: 'Start', type: 'trigger' as const }],
      },
    ],
  };

  it('counts valid workflows', () => {
    expect(countValidWorkflows(canvasWithWf)).toBe(1);
  });

  it('suppresses wait messages when workflows exist', () => {
    expect(
      shouldSuppressPlanWorkflowCoachNotice('plan', canvasWithWf, 'orchestration_deferred'),
    ).toBe(true);
  });

  it('does not suppress without workflows', () => {
    expect(
      shouldSuppressPlanWorkflowCoachNotice('plan', { workflows: [] }, 'orchestration_deferred'),
    ).toBe(false);
  });
});
