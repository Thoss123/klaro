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

    expect(prompt).toContain('Stelle nie zwei Fragen in einem Satz');
    expect(prompt).toContain('Ein questions-Array ist verboten');
    expect(prompt).toContain('Okay, verstanden');
    expect(prompt).toContain('options, getcredential und wissen_anfrage dürfen nie gemeinsam');
    expect(prompt).toContain('Weitere Bereiche werden später in einem eigenen Gespräch eingerichtet');
  });

  it('explains mail knowledge and safety before connections', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('Gesendete E-Mails dürfen nur nach ausdrücklicher Zustimmung');
    expect(prompt).toContain('crm_noetig');
    expect(prompt).toContain('kalender_noetig');
    expect(prompt).toContain('Biete das Postfach erst an');
    expect(prompt).toMatch(/Die zweite Stufe darf als empfohlen\s+markiert werden/);
  });

  it('keeps the supported setup tags in the runtime prompt', () => {
    const prompt = buildPrompt();

    expect(prompt).toContain('<profil feld="gewerk|firmenname|mitarbeiter|standort|ton|ansprechpartner|rolle|website">');
    expect(prompt).toContain('<scope id="email_triage|angebot|rechnung|followup"');
    expect(prompt).toContain('<getcredential tool="email|telegram"/>');
    expect(prompt).toContain('<zusammenfassung_bestaetigt/>');
  });
});
