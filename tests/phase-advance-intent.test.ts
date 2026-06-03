import { describe, it, expect } from 'vitest';
import { detectPhaseAdvanceIntent } from '@/lib/phase-advance-intent';
import { evaluateCanvasEligibility } from '@/lib/sync-decision';
import type { CanvasData } from '@/lib/types';

describe('detectPhaseAdvanceIntent', () => {
  it('erkennt explizite Phrasen', () => {
    expect(detectPhaseAdvanceIntent('NÄCHSTE PHASE')).toBe(true);
    expect(detectPhaseAdvanceIntent('Weiter')).toBe(true);
    expect(detectPhaseAdvanceIntent('Wir haben 4 workflows fertig geh weiter man')).toBe(true);
  });

  it('ignoriert normale Antworten', () => {
    expect(detectPhaseAdvanceIntent('Wir nutzen HubSpot für Leads.')).toBe(false);
  });
});

describe('evaluateCanvasEligibility phase advance', () => {
  const canvas: Partial<CanvasData> = {
    workflows: [
      {
        id: 'w1',
        title: 'Flow',
        steps: [{ id: 's1', label: 'Start', type: 'trigger' }],
      },
    ],
  };

  it('blockiert Canvas bei Plan-Weiter mit Workflows', () => {
    const r = evaluateCanvasEligibility({
      isHiddenInit: false,
      projectId: 'p',
      phase: 'plan',
      userMessages: [{ role: 'user', content: 'Weiter' }],
      workerAlreadyScheduled: false,
      canvas,
      latestUserMessage: 'Weiter',
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('phase_advance_requested');
  });
});
