import { describe, expect, it } from 'vitest';
import { validateWorkflowStructure } from '@/lib/n8n-workflow-validate';
import type { Workflow } from '@/lib/types';

describe('validateWorkflowStructure', () => {
  it('lehnt Workflow ohne Trigger ab', () => {
    const wf: Workflow = {
      id: 'wf1',
      title: 'Test',
      linked_pain_point: 'pp1',
      steps: [
        { id: 's1', label: 'Gmail', type: 'action', n8nType: 'n8n-nodes-base.gmail' },
      ],
      edges: [],
    };
    const r = validateWorkflowStructure(wf);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'no_trigger')).toBe(true);
  });

  it('akzeptiert Webhook-Trigger am Anfang', () => {
    const wf: Workflow = {
      id: 'wf1',
      title: 'Test',
      linked_pain_point: 'pp1',
      steps: [
        { id: 's1', label: 'Webhook', type: 'trigger', n8nType: 'n8n-nodes-base.webhook' },
        { id: 's2', label: 'Set', type: 'action', n8nType: 'n8n-nodes-base.set' },
      ],
      edges: [{ id: 'e1', source: 's1', target: 's2' }],
    };
    const r = validateWorkflowStructure(wf);
    expect(r.valid).toBe(true);
  });
});
