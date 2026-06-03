import { describe, it, expect } from 'vitest';
import { getHiddenInitMessage } from '@/lib/phase-welcome';
import {
  evaluateCanvasEligibility,
  evaluateHistoryForCanvas,
  summarizeCanvasDiff,
} from '@/lib/sync-decision';

describe('evaluateCanvasEligibility', () => {
  const longMsg = { role: 'user', content: 'Wir verlieren viel Zeit bei der Angebotserstellung jede Woche aufs Neue.' };

  it('blocks hidden init', () => {
    const r = evaluateCanvasEligibility({ isHiddenInit: true, projectId: 'p', phase: 'diagnose', userMessages: [longMsg], workerAlreadyScheduled: false });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('hidden_init');
  });

  it('blocks when projectId missing', () => {
    const r = evaluateCanvasEligibility({ isHiddenInit: false, projectId: null, phase: 'diagnose', userMessages: [longMsg], workerAlreadyScheduled: false });
    expect(r.reason).toBe('no_project_id');
  });

  it('blocks when worker already scheduled', () => {
    const r = evaluateCanvasEligibility({ isHiddenInit: false, projectId: 'p', phase: 'plan', userMessages: [longMsg], workerAlreadyScheduled: true });
    expect(r.reason).toBe('worker_already_running');
  });

  it('blocks thin user context in plan (await workflow chat)', () => {
    const r = evaluateCanvasEligibility({ isHiddenInit: false, projectId: 'p', phase: 'plan', userMessages: [{ role: 'user', content: 'ok' }], workerAlreadyScheduled: false });
    expect(r.reason).toBe('plan_awaiting_workflow_chat');
  });

  it('ignores hidden kickoff lines for eligibility', () => {
    const r = evaluateCanvasEligibility({
      isHiddenInit: false,
      projectId: 'p',
      phase: 'plan',
      userMessages: [{ role: 'user', content: getHiddenInitMessage('plan') }],
      workerAlreadyScheduled: false,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('plan_awaiting_workflow_chat');
  });

  it('blocks diagnose welcome-only chatter', () => {
    const r = evaluateCanvasEligibility({ isHiddenInit: false, projectId: 'p', phase: 'diagnose', userMessages: [{ role: 'user', content: 'Hallo, lass uns starten!' }, { role: 'user', content: 'Starte Phase 1 bitte jetzt los' }], workerAlreadyScheduled: false });
    expect(r.reason).toBe('thin_user_context');
  });

  it('allows a substantive message', () => {
    const r = evaluateCanvasEligibility({ isHiddenInit: false, projectId: 'p', phase: 'plan', userMessages: [longMsg], workerAlreadyScheduled: false });
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe('ok');
  });
});

describe('evaluateHistoryForCanvas', () => {
  it('mirrors eligibility server-side', () => {
    const ok = evaluateHistoryForCanvas('plan', [{ role: 'user', content: 'Ein ausführlicher Satz über unsere Prozesse und Engpässe hier.' }]);
    expect(ok.ok).toBe(true);
    const bad = evaluateHistoryForCanvas('plan', [{ role: 'user', content: 'hi' }]);
    expect(bad.ok).toBe(false);
  });
});

describe('summarizeCanvasDiff', () => {
  it('describes counts and deltas', () => {
    const s = summarizeCanvasDiff(
      { pain_points: [{}], use_cases: [] },
      { pain_points: [{}, {}], use_cases: [{}], company: { process_steps: ['a'], change_appetite: 'bold' } },
    );
    expect(s).toContain('pain_points 1→2 (Δ+1)');
    expect(s).toContain('use_cases 0→1 (Δ+1)');
    expect(s).toContain('change_appetite=bold');
  });
});
