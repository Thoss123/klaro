const PHASE_ORDER = ['diagnose', 'analyse', 'plan', 'umsetzung'] as const;

/**
 * Returns the completed phase name if the assistant message signals a phase handoff.
 */
export function detectCompletedPhase(rawContent: string, currentPhase: string): string | null {
  if (!rawContent) return null;

  const completeMatch = rawContent.match(/<phase_complete>\s*(\w+)\s*<\/phase_complete>/i);
  if (completeMatch?.[1] === currentPhase) return currentPhase;

  if (/<prepare_phase[\s>]/i.test(rawContent) || /"type"\s*:\s*"prepare_phase"/i.test(rawContent)) {
    const nextMatch = rawContent.match(/"next_phase"\s*:\s*"(\w+)"/i);
    const currentIdx = PHASE_ORDER.indexOf(currentPhase as (typeof PHASE_ORDER)[number]);
    if (currentIdx === -1) return null;
    const expectedNext = PHASE_ORDER[currentIdx + 1];
    if (!expectedNext) return null;
    if (!nextMatch || nextMatch[1] === expectedNext) return currentPhase;
  }

  return null;
}
