const MULTI_SEP = ' · ';

/** Parse multi-select onboarding field (deduped). */
export function parseMultiValue(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return [...new Set(raw.split(MULTI_SEP).map(s => s.trim()).filter(Boolean))];
}

export function joinMultiValue(values: string[]): string {
  return [...new Set(values.map(s => s.trim()).filter(Boolean))].join(MULTI_SEP);
}

export function toggleMultiValue(current: string | undefined, value: string): string {
  const list = parseMultiValue(current);
  const idx = list.indexOf(value);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(value);
  return joinMultiValue(list);
}

/** Coach path when ziel may contain multiple selections (legacy comma data included). */
export function resolveDiagnosePath(ziel: string | undefined): 'A' | 'B' | 'C' | 'D' | 'E' {
  const parts = ziel
    ? [...new Set(ziel.split(/[,;·]/).map(s => s.trim()).filter(Boolean))]
    : [];
  if (parts.some(p => p.includes('Genauer Plan') || p.includes('nur noch umsetzen'))) return 'E';
  if (parts.some(p => p.includes('konkrete Ideen') || p.includes('brauche Plan'))) return 'B';
  if (parts.some(p => p.includes('sinnvoll'))) return 'C';
  if (parts.some(p => p.includes('Briefing'))) return 'D';
  return 'A';
}
