const PHASE_ORDER = ['diagnose', 'analyse', 'plan', 'umsetzung'] as const;

/**
 * Returns the completed phase name if the assistant message signals a phase handoff.
 */
export function detectCompletedPhase(rawContent: string, currentPhase: string): string | null {
  if (!rawContent) return null;

  const completeMatch = rawContent.match(/<phase_complete>\s*(\w+)\s*<\/phase_complete>/i);
  if (completeMatch?.[1] === currentPhase) return currentPhase;

  return null;
}
