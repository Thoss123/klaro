import { describe, expect, it } from 'vitest';
import { workflowStructureChanged } from '@/lib/agents/workflow-editor';
import type { Workflow } from '@/lib/types';

describe('workflowStructureChanged', () => {
  const base: Workflow = {
    id: 'wf1',
    title: 'T',
    linked_pain_point: 'pp1',
    steps: [
      { id: 'a', label: 'A', type: 'trigger', n8nType: 'n8n-nodes-base.webhook' },
      { id: 'b', label: 'B', type: 'action', n8nType: 'n8n-nodes-base.set' },
    ],
    edges: [{ id: 'e1', source: 'a', target: 'b' }],
  };

  it('false bei nur Parameter-Update', () => {
    expect(workflowStructureChanged(base, { steps: base.steps, edges: base.edges ?? [] })).toBe(false);
  });

  it('true wenn Schritt hinzugefügt', () => {
    expect(
      workflowStructureChanged(base, {
        steps: [...base.steps, { id: 'c', label: 'C', type: 'action', n8nType: 'n8n-nodes-base.slack' }],
        edges: base.edges ?? [],
      }),
    ).toBe(true);
  });
});
