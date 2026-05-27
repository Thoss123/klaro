/** Hidden user message that kicks off the coach per phase (not shown in UI). */
export function getHiddenInitMessage(phase: string): string {
  switch (phase) {
    case 'analyse':
      return (
        'Starte Phase 2 (Analyse). Keine Phase-1-Begrüßung, kein „Lass uns gleich starten“, ' +
        'keine Onboarding-Fragen zum Angebot. Kurz die Pain Points aus Phase 1 zusammenfassen, ' +
        'dann direkt die erste Tool-Frage zum wichtigsten Pain Point.'
      );
    case 'plan':
      return (
        'Starte Phase 3 (Plan). Kurz Recap aus Phase 2 (Tools & Pain Points), ' +
        'dann direkt den ersten Workflow-Schritt besprechen — keine erneute Vorstellung.'
      );
    case 'umsetzung':
      return (
        'Starte Phase 4 (Umsetzung). Kurz Recap der geplanten Workflows, ' +
        'dann mit dem ersten Deployment-Schritt — keine Phase-1-Begrüßung.'
      );
    default:
      return 'Hallo, lass uns starten!';
  }
}
