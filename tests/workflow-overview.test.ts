import { describe, it, expect } from 'vitest';
import { findSourceStepForSwap, mainWorkflowSteps } from '@/lib/workflow-overview';
import type { WorkflowStep } from '@/lib/types';

const steps: WorkflowStep[] = [
  { id: 's1', label: 'Start', type: 'trigger', n8nType: 'n8n-nodes-base.manualTrigger' },
  { id: 's2', label: 'Kundendaten CRM', type: 'action', n8nType: 'n8n-nodes-base.airtable', tool: 'airtable' },
  { id: 's3', label: 'Angebot senden', type: 'action', n8nType: 'n8n-nodes-base.gmail', tool: 'gmail' },
];

describe('findSourceStepForSwap', () => {
  it('finds step by number', () => {
    const found = findSourceStepForSwap(steps, 'ändere Schritt 2 zu Slack', 2, 'Slack');
    expect(found?.id).toBe('s2');
  });

  it('finds source by label, not target', () => {
    const found = findSourceStepForSwap(steps, 'ändere Gmail zu Airtable', null, 'Airtable');
    expect(found?.id).toBe('s3');
  });

  it('mainWorkflowSteps excludes sub-nodes', () => {
    const withSub: WorkflowStep[] = [
      ...steps,
      { id: 'sub1', label: 'Chat Model', subNodeOf: { parentId: 's2', slot: 'ai_languageModel' } },
    ];
    expect(mainWorkflowSteps(withSub)).toHaveLength(3);
  });
});
