import { describe, it, expect, afterEach } from 'vitest';
import { getCoachSystemPrompt, isCoachV2Enabled } from '@/lib/coach/assemble';

describe('coach v2 prompt assembly', () => {
  const ORIGINAL_FLAG = process.env.COACH_V2;

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.COACH_V2;
    else process.env.COACH_V2 = ORIGINAL_FLAG;
  });

  it('is enabled by default and disabled via COACH_V2=false', () => {
    delete process.env.COACH_V2;
    expect(isCoachV2Enabled()).toBe(true);
    process.env.COACH_V2 = 'false';
    expect(isCoachV2Enabled()).toBe(false);
    process.env.COACH_V2 = 'true';
    expect(isCoachV2Enabled()).toBe(true);
  });

  it.each([
    ['diagnose', '<phase_complete>diagnose</phase_complete>'],
    ['analyse', '<phase_complete>analyse</phase_complete>'],
    // Legacy-Alias: 'plan'-Sessions laufen im gemergten Analyse-Modul weiter.
    ['plan', '<phase_complete>analyse</phase_complete>'],
    ['umsetzung', '<phase_complete>umsetzung</phase_complete>'],
  ])('assembles %s with base, shared rules and phase module', (phase, marker) => {
    const prompt = getCoachSystemPrompt(phase);
    expect(prompt).toBeTruthy();
    // Tag-Vertrag der App (aus AXANTILO_SHARED_RULES)
    expect(prompt).toContain('Eiserne Grundregeln');
    // Basis: Modus-Regel + Guardrails
    expect(prompt).toContain('Modus-Regel');
    expect(prompt).toContain('Guardrails');
    // Phasenmodul eingesetzt, Platzhalter aufgelöst
    expect(prompt).toContain(marker);
    expect(prompt).not.toContain('{{phase_module}}');
  });

  it('falls back to the diagnose module for unknown phases', () => {
    const prompt = getCoachSystemPrompt('gibts-nicht');
    expect(prompt).toBeTruthy();
    expect(prompt).toContain('<phase_complete>diagnose</phase_complete>');
  });

  it('keeps the route-filled placeholders intact for the pipeline', () => {
    const prompt = getCoachSystemPrompt('umsetzung')!;
    // Diese Platzhalter füllt app/api/chat/route.ts nach der Assembly.
    expect(prompt).toContain('{{workflow_plans}}');
    expect(prompt).toContain('{{workflows}}');
    expect(prompt).toContain('{{firmen_kontext}}');
    expect(prompt).toContain('{{memory}}');
  });

  it('module contract: no hardcoded workflow names or counts in phase modules', () => {
    for (const phase of ['diagnose', 'analyse', 'plan', 'umsetzung']) {
      const prompt = getCoachSystemPrompt(phase)!;
      expect(prompt).not.toMatch(/die \d+ Workflows/i);
    }
  });
});
