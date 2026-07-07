import { describe, expect, it } from 'vitest';
import { mergeWorkflowPlanIntoCanvas } from '@/lib/merge-workflow-plan';
import { getWorkflowPlans } from '@/lib/workflow-plans';
import type { CanvasData } from '@/lib/types';

describe('mergeWorkflowPlanIntoCanvas', () => {
  it('adds plan to workflow_plans and workflows', () => {
    const canvas: CanvasData = {
      phase: 'analyse',
      pain_points: [],
      use_cases: [],
      workflows: [],
      documents: [],
    };
    const result = mergeWorkflowPlanIntoCanvas(canvas, {
      title: 'Exposé-Erstellung',
      pain_point_id: 'pp_2',
      steps: [{ label: 'Start', type: 'trigger', tool: 'form' }],
    });
    expect(result).not.toBeNull();
    expect(result!.planId).toMatch(/^wf_/);
    expect(result!.canvas.workflow_plans).toHaveLength(1);
    expect(result!.canvas.workflows).toHaveLength(1);
    expect(getWorkflowPlans(result!.canvas)[0].title).toBe('Exposé-Erstellung');
  });

  it('updates existing plan by plan_id', () => {
    const canvas: CanvasData = {
      phase: 'analyse',
      pain_points: [],
      use_cases: [],
      workflows: [],
      documents: [],
      workflow_plans: [
        {
          id: 'wf_100',
          title: 'Alt',
          linked_pain_point: 'pp_2',
          steps: [{ id: 'step_1', label: 'Alt', type: 'trigger', tool: 'form' }],
        },
      ],
    };
    const result = mergeWorkflowPlanIntoCanvas(canvas, {
      plan_id: 'wf_100',
      title: 'Neu',
      pain_point_id: 'pp_2',
      steps: [{ label: 'Neu', type: 'trigger', tool: 'form' }],
    });
    expect(result!.canvas.workflow_plans).toHaveLength(1);
    expect(result!.canvas.workflow_plans![0].title).toBe('Neu');
  });
});
