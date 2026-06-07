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
        'Starte Phase 3 (Plan). Prüfe ZUERST still, ob mehrere Pain Points über denselben Kanal laufen — ' +
        'wenn ja, schlage einen gemeinsamen Workflow vor. ' +
        'Dann kurz Recap was du aus Phase 1–2 schon weißt (Pain + Tools), ' +
        'dann nur EINE Lücken-Frage zum ersten (wichtigsten) Pain Point — kein A/B/C (war Phase 2), ' +
        'kein kompletter Workflow von vorn, keine erneute Vorstellung. ' +
        'Sobald der Ablauf klar ist: recherchiere mögliche Lösungen und biete dem Nutzer 2–3 Ansätze ' +
        'mit Vor-/Nachteilen zur Auswahl an (mit Auswahl-Buttons). Erst nach seiner Wahl das Canvas-Update. ' +
        'Sag dem Nutzer in 1 Satz: Den Workflow-Plan in der Roadmap rechts legst du erst an, ' +
        'wenn ihr hier den konkreten Ablauf für einen Pain Point besprochen habt — nicht schon jetzt.'
      );
    case 'umsetzung':
      return (
        `${SYSTEM_PREFIX} phase=umsetzung\n` +
        'Starte Phase 4 (Umsetzung). Es gibt NOCH KEINE Deploy-Karten auf dem Canvas — nur Pläne in {{workflow_plans}}. ' +
        'Liste die Plan-Titel nummeriert (kurze Titel), sag dass rechts noch nichts gebaut ist, frag: „Womit willst du anfangen?“ ' +
        'Sobald der Nutzer eine Zahl oder einen Titel schreibt: SOFORT build_workflow mit der passenden workflow_id aufrufen — ' +
        'ohne Rückfrage, ohne Bestätigung, Tool zuerst dann Text. ' +
        'KEINE A/B/C, kein Tool-Interview, keine fertigen-Workflows-Behauptung.'
      );
    default:
      return `${SYSTEM_PREFIX} phase=diagnose\nHallo, lass uns starten!`;
  }
}
