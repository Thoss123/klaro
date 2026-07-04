import type { Phase } from '@/lib/types';

/**
 * Einzige Quelle für Phasen-Reihenfolge und -Labels (3 Phasen seit dem
 * Merge von Analyse+Plan). Import statt lokaler Kopien — die Duplikate in
 * page.tsx/RoadmapCanvas/Header-Komponenten sind darauf umgestellt.
 */
export const PHASE_ORDER: readonly Phase[] = ['diagnose', 'analyse', 'umsetzung'];

export const PHASE_LABELS: Record<string, string> = {
  diagnose: '1. Diagnose',
  analyse: '2. Analyse & Plan',
  plan: '2. Analyse & Plan', // Legacy-Alias
  umsetzung: '3. Umsetzung',
};

/** Kurze Labels ohne Nummer (Header/Menüs, die die Nummer separat rendern). */
export const PHASE_SHORT_LABELS: Record<string, string> = {
  diagnose: 'Diagnose',
  analyse: 'Analyse & Plan',
  plan: 'Analyse & Plan', // Legacy-Alias
  umsetzung: 'Umsetzung',
};

/**
 * Legacy-tolerant: alte Sessions/Canvas-Stände tragen noch phase='plan'
 * (bis 2026-07 eine eigene Phase, jetzt Teil von 'analyse').
 */
export function normalizePhase(phase?: string | null): Phase {
  if (phase === 'plan') return 'analyse';
  if (phase === 'diagnose' || phase === 'analyse' || phase === 'umsetzung') return phase;
  return 'diagnose';
}

/** Index in PHASE_ORDER, legacy-tolerant ('plan' zählt als 'analyse'). */
export function phaseIndex(phase?: string | null): number {
  return PHASE_ORDER.indexOf(normalizePhase(phase));
}
