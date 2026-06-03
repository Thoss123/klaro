import { describe, it, expect } from 'vitest';
import { parseMultiValue, joinMultiValue, toggleMultiValue, resolveDiagnosePath } from '@/lib/onboarding-multi';
import { formatTeamSize, isSoloTeam } from '@/lib/onboarding-labels';

describe('onboarding-multi', () => {
  it('parses and dedupes a separated value', () => {
    expect(parseMultiValue('A · B · A')).toEqual(['A', 'B']);
    expect(parseMultiValue('')).toEqual([]);
    expect(parseMultiValue(undefined)).toEqual([]);
  });

  it('joins with the separator and dedupes', () => {
    expect(joinMultiValue(['A', 'B', 'A'])).toBe('A · B');
    expect(joinMultiValue([' x ', ''])).toBe('x');
  });

  it('toggles a value on and off', () => {
    expect(toggleMultiValue(undefined, 'X')).toBe('X');
    expect(toggleMultiValue('X', 'X')).toBe('');
    expect(toggleMultiValue('X', 'Y')).toBe('X · Y');
  });

  it('resolves the diagnose path from ziel', () => {
    expect(resolveDiagnosePath('Ich habe schon konkrete Ideen')).toBe('B');
    expect(resolveDiagnosePath('ob KI sinnvoll ist')).toBe('C');
    expect(resolveDiagnosePath('Briefing für die IT')).toBe('D');
    expect(resolveDiagnosePath('weiß noch nicht')).toBe('A');
    expect(resolveDiagnosePath(undefined)).toBe('A');
  });

  it('prioritizes B over C when both present', () => {
    expect(resolveDiagnosePath('konkrete Ideen, ob sinnvoll')).toBe('B');
  });
});

describe('onboarding-labels', () => {
  it('formats known team sizes', () => {
    expect(formatTeamSize('solo')).toBe('Solo-Selbstständig');
    expect(formatTeamSize('large_plus')).toBe('Mehr als 50 Mitarbeiter');
    expect(formatTeamSize(undefined)).toBe('Nicht angegeben');
    expect(formatTeamSize('unknown')).toBe('unknown');
  });

  it('detects solo teams from various phrasings', () => {
    expect(isSoloTeam('solo')).toBe(true);
    expect(isSoloTeam('Einzelperson')).toBe(true);
    expect(isSoloTeam('1')).toBe(true);
    expect(isSoloTeam('small')).toBe(false);
    expect(isSoloTeam(undefined)).toBe(false);
  });
});
