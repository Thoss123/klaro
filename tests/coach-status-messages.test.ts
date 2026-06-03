import { describe, it, expect } from 'vitest';
import { coachStatusMessageForCanvas } from '@/lib/coach-status-messages';

describe('coachStatusMessageForCanvas', () => {
  it('explains plan phase deferral in coach voice', () => {
    const msg = coachStatusMessageForCanvas('orchestration_deferred', 'plan');
    expect(msg).toMatch(/Workflow-Plan/);
    expect(msg).not.toMatch(/\[System/i);
  });

  it('explains awaiting user input in plan', () => {
    const msg = coachStatusMessageForCanvas('plan_awaiting_workflow_chat', 'plan');
    expect(msg).toMatch(/deine Antwort/);
  });

  it('returns null for hidden init', () => {
    expect(coachStatusMessageForCanvas('hidden_init', 'plan')).toBeNull();
  });
});
