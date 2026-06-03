const SYSTEM_PREFIX = '[__klaro_system__]';

/** Hidden user message that kicks off the coach per phase (not shown in UI, not saved). */
export function getHiddenInitMessage(phase: string): string {
  switch (phase) {
    case 'analyse':
      return (
        `${SYSTEM_PREFIX} phase=analyse\n` +
        'Starte Phase 2 (Analyse). Keine Phase-1-Begrüßung, kein „Lass uns gleich starten“, ' +
        'keine Onboarding-Fragen zum Angebot. Kurz Pain Points recap, dann die A/B/C-Veränderungsfrage ' +
        '(einmalig), danach erste Tool-Frage zum wichtigsten Pain Point.'
      );
    case 'plan':
      return (
        `${SYSTEM_PREFIX} phase=plan\n` +
        'Starte Phase 3 (Plan). Kurz Recap was du aus Phase 1–2 schon weißt (Pain + Tools), ' +
        'dann nur EINE Lücken-Frage zum ersten Pain Point — kein A/B/C (war Phase 2), ' +
        'kein kompletter Workflow von vorn, keine erneute Vorstellung.'
      );
    case 'umsetzung':
      return (
        `${SYSTEM_PREFIX} phase=umsetzung\n` +
        'Starte Phase 4 (Umsetzung). Liste die fertigen Workflows vom Canvas by title (aus {{workflows}}). ' +
        'Frage: Soll ich Workflow 1 jetzt erstellen oder einen anderen zuerst? ' +
        'KEINE A/B/C-Veränderungsfrage, kein Tool-Interview, kein Workflow-Neuentwurf — nur Deploy der Phase-3-Pläne.'
      );
    default:
      return `${SYSTEM_PREFIX} phase=diagnose\nHallo, lass uns starten!`;
  }
}
