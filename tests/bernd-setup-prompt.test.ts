import { describe, expect, it } from 'vitest';
import { buildSetupSystemPrompt } from '@/lib/bernd/setup-prompt';

function buildPrompt() {
  return buildSetupSystemPrompt({
    gewerk: 'Elektriker',
    vorwissen: '- Gewerk: Elektriker\n- Zeitfresser: Kundenmails',
    gateStatus: '- E-Mail: offen',
    heute: '13. Juli 2026',
  });
}

describe('buildSetupSystemPrompt', () => {
  it('injects onboarding and gate context without leaking placeholders', () => {
    const prompt = buildPrompt();

    expect(prompt).toContain('Elektriker');
    expect(prompt).toContain('Zeitfresser: Kundenmails');
    expect(prompt).toContain('E-Mail: offen');
    expect(prompt).toContain('13. Juli 2026');
    expect(prompt).not.toMatch(/{{(?:gewerk|vorwissen|gate_status|heute)}}/);
  });

  it('enforces one semantic question and the single-question options schema', () => {
    const prompt = buildPrompt();

    expect(prompt).toContain('genau EINER Frage');
    expect(prompt).toContain('Nutze NIEMALS ein questions-Array');
    expect(prompt).toContain('Wie heisst dein Betrieb?');
    expect(prompt).toContain('Frage dabei nicht erneut nach Gewerk oder');
    expect(prompt).toContain('options, getcredential und wissen_anfrage duerfen nie gemeinsam');
  });

  it('keeps the supported setup tags in the runtime prompt', () => {
    const prompt = buildPrompt();

    expect(prompt).toContain('<profil feld="gewerk|firmenname|mitarbeiter|standort|ton">');
    expect(prompt).toContain('<scope id="email_triage|angebot|rechnung|followup"');
    expect(prompt).toContain('<getcredential tool="email|telegram"/>');
    expect(prompt).toContain('<zusammenfassung_bestaetigt/>');
  });
});
