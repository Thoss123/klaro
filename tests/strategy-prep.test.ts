import { describe, expect, it } from 'vitest';
import {
  applyPrepStep,
  createInitialPrepProgress,
  estimatePrepSecondsRemaining,
  prepProgressPercent,
  STRATEGY_PREP_STEPS,
} from '@/lib/strategy-prep';

describe('strategy-prep', () => {
  it('has 5 pipeline steps', () => {
    expect(STRATEGY_PREP_STEPS).toHaveLength(5);
  });

  it('applyPrepStep marks running then done and advances index', () => {
    let p = createInitialPrepProgress();
    p = applyPrepStep(p, 0, 'running');
    expect(p.steps[0].status).toBe('running');
    expect(p.currentIndex).toBe(0);

    p = applyPrepStep(p, 0, 'done');
    expect(p.steps[0].status).toBe('done');
    expect(p.currentIndex).toBe(1);
  });

  it('prepProgressPercent reflects done steps not fake 92% cap', () => {
    let p = createInitialPrepProgress();
    expect(prepProgressPercent(p)).toBe(0);

    p = applyPrepStep(p, 0, 'done');
    p = applyPrepStep(p, 1, 'done');
    expect(prepProgressPercent(p)).toBeGreaterThanOrEqual(40);
    expect(prepProgressPercent(p)).toBeLessThan(100);
  });

  it('estimatePrepSecondsRemaining decreases as steps complete', () => {
    let p = createInitialPrepProgress();
    const start = estimatePrepSecondsRemaining(p);
    p = applyPrepStep(p, 0, 'done');
    p = applyPrepStep(p, 1, 'done');
    p = applyPrepStep(p, 2, 'done');
    const later = estimatePrepSecondsRemaining(p);
    expect(start).toBeTruthy();
    expect(later).toBeTruthy();
    expect(later!).toBeLessThan(start!);
  });
});
