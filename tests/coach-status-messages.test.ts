import { describe, it, expect } from 'vitest';
import { coachStatusMessageForCanvas } from '@/lib/coach-status-messages';

describe('coachStatusMessageForCanvas', () => {
  it('explains workflow deferral in coach voice (merged analyse)', () => {
    const msg = coachStatusMessageForCanvas('orchestration_deferred', 'analyse');
    expect(msg).toMatch(/Workflow-Plan/);
    expect(msg).not.toMatch(/\[System/i);
  });

  it('stays silent when the analyse canvas already has workflows', () => {
    const msg = coachStatusMessageForCanvas('orchestration_deferred', 'analyse', {
      workflows: [
        {
          id: 'w1',
          title: 'A',
          linked_pain_point: 'pp_1',
          steps: [{ id: 's1', label: 'x', type: 'trigger' }],
        },
      ],
    });
    expect(msg).toBeNull();
  });

  it('explains awaiting user input in the merged analyse', () => {
    const msg = coachStatusMessageForCanvas('thin_user_context', 'analyse');
    expect(msg).toMatch(/Workflow-Plan|Konkretes/);
  });

  it('returns null for hidden init', () => {
    expect(coachStatusMessageForCanvas('hidden_init', 'analyse')).toBeNull();
  });
});
