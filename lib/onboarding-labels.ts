/** Human-readable team size for prompts (values from onboarding wizard). */
export function formatTeamSize(raw: string | undefined): string {
  const map: Record<string, string> = {
    solo: 'Solo-Selbstständig',
    small: '2–5 Mitarbeiter',
    medium: '6–20 Mitarbeiter',
    large: '21–50 Mitarbeiter',
    large_plus: 'Mehr als 50 Mitarbeiter',
  };
  if (!raw) return 'Nicht angegeben';
  return map[raw] || raw;
}

export function isSoloTeam(raw: string | undefined): boolean {
  const ug = (raw || '').toLowerCase();
  return /solo|freelancer|1\s*person|einzelperson|allein|solopreneur|^1$|selbst/.test(ug);
}
