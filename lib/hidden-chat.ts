import { getHiddenInitMessage } from '@/lib/phase-welcome';

/** Matches system kickoff messages — never show in chat UI or use as session title. */
export function isHiddenSystemMessage(content: string): boolean {
  const t = (content || '').trim();
  if (!t) return false;
  if (/^Hallo,?\s*lass uns starten!?$/i.test(t)) return true;
  if (/^Starte Phase \d/i.test(t)) return true;
  if (t.startsWith('[__axantilo_system__]')) return true;
  const phases = ['diagnose', 'analyse', 'plan', 'umsetzung'] as const;
  for (const ph of phases) {
    if (t === getHiddenInitMessage(ph)) return true;
  }
  return false;
}

/** History for canvas sync / orchestration — ohne versteckte Kickoff-Zeilen. */
export function filterCanvasHistory<T extends { role: string; content: string }>(
  history: T[],
): T[] {
  return history.filter(m => !(m.role === 'user' && isHiddenSystemMessage(m.content)));
}
