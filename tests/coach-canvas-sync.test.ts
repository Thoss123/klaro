import { describe, expect, it } from 'vitest';
import {
  claimsCanvasUpdateWithoutTag,
  shouldRecoverCoachCanvas,
  stripStreamingCanvasTail,
  userRequestedCanvasBuild,
} from '@/lib/coach-canvas-sync';

describe('coach-canvas-sync', () => {
  it('detects canvas claims without tag', () => {
    expect(
      claimsCanvasUpdateWithoutTag('Ich halte das kurz fest.\nRechts siehst du den Punkt.'),
    ).toBe(true);
    expect(
      claimsCanvasUpdateWithoutTag('Ok <canvas_update>{"pain_points":[]}</canvas_update>'),
    ).toBe(false);
  });

  it('detects user canvas complaint', () => {
    expect(userRequestedCanvasBuild('bau das mal am canvas ich sehs noch nicht')).toBe(true);
  });

  it('stripStreamingCanvasTail hides partial tag', () => {
    const raw = 'Echo.\n\nFrage?\n<canvas_update>{"pain';
    expect(stripStreamingCanvasTail(raw)).toBe('Echo.\n\nFrage?');
  });

  it('shouldRecover when facts acknowledged but no tag', () => {
    expect(
      shouldRecoverCoachCanvas({
        phase: 'diagnose',
        rawAssistant: '10–18 Stunden — riesiger Hebel. Ich halte das kurz fest.',
        userMessage: '5-6 exposes im monat, 2-3 h pro stück',
        canvasApplied: false,
      }),
    ).toBe(true);
    expect(
      shouldRecoverCoachCanvas({
        phase: 'diagnose',
        rawAssistant: 'Ok <canvas_update>{"x":1}</canvas_update>',
        userMessage: 'test',
        canvasApplied: true,
      }),
    ).toBe(false);
  });
});
