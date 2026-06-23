const SYSTEM_PREFIX = '[__axantilo_system__]';

/** Hidden user message that kicks off the coach per phase (not shown in UI, not saved). */
export function getHiddenInitMessage(phase: string): string {
  switch (phase) {
    case 'analyse':
      return (
        `${SYSTEM_PREFIX} phase=analyse\n` +
        'Starte Phase 2 (Analyse). Keine Phase-1-Begrüßung, kein „Lass uns gleich starten“, ' +
        'keine Onboarding-Fragen zum Angebot. Sag ZUERST in einem Satz, was Phase 2 tut: nur den ' +
        'Ist-Stand ermitteln (womit sie heute arbeiten), noch keine neuen Tools entscheiden. ' +
        'Dann kurz die potenziellen Verbesserungen recap, danach DIREKT die erste Tool-Frage zum wichtigsten Punkt — ' +
        'im Chat „potenzielle Verbesserung"/„Bereich" sagen, nicht „Pain Point". ' +
        'KEINE A/B/C-Veränderungsfrage (entfällt; Tool-Wechsel besprechen wir später konkret in Phase 3). ' +
        'Wenn alle Tools erfasst sind: die Punkte gemeinsam mit dem Nutzer bewerten und nach Aufwand/Hebel ordnen. ' +
        'Nutze für klare Auswahlen Klick-Buttons.'
      );
    case 'plan':
      return (
        `${SYSTEM_PREFIX} phase=plan\n` +
        'Starte Phase 3 (Plan). Prüfe ZUERST still, ob mehrere Pain Points über denselben Kanal laufen — ' +
        'wenn ja, schlage einen gemeinsamen Workflow vor. ' +
        'Sag ZUERST in einem Satz, was Phase 3 tut: jetzt entwerfen wir pro Baustelle den konkreten ' +
        'Ablauf (wie KI/Automatisierung den nervigen Teil übernimmt). ' +
        'Geh die Pain Points in der rank-Reihenfolge aus Phase 2 durch. ' +
        'Dann kurz Recap was du aus Phase 1–2 schon weißt (Pain + Tools), ' +
        'dann nur EINE Lücken-Frage zum ersten (wichtigsten) Pain Point — keine pauschale Veränderungsfrage, ' +
        'kein kompletter Workflow von vorn, keine erneute Vorstellung. ' +
        'Sobald der Ablauf klar ist: leite ZUERST Ziel + Lösungsweg her und lass ihn bestätigen ' +
        '(„Passt der Ansatz?", mit Buttons); ungeeignete Ist-Tools fallweise auf bessere umstellen anbieten. ' +
        'ERST DANN recherchiere mögliche Lösungen und biete 2–3 konkrete Ansätze ' +
        'mit Vor-/Nachteilen zur Auswahl an (mit Auswahl-Buttons). Erst nach seiner Wahl das Canvas-Update. ' +
        'Sag dem Nutzer in 1 Satz: Den Workflow-Plan in der Roadmap rechts legst du erst an, ' +
        'wenn ihr hier den konkreten Ablauf für einen Pain Point besprochen habt — nicht schon jetzt.'
      );
    case 'umsetzung':
      return (
        `${SYSTEM_PREFIX} phase=umsetzung\n` +
        'Starte Phase 4 (Umsetzung). Sag ZUERST in einem Satz, was Phase 4 tut: jetzt setzen wir die Pläne ' +
        'technisch um — pro Plan bauen, Schritte prüfen, Zugänge einrichten, testen, live schalten. ' +
        'Es gibt NOCH KEINE Deploy-Karten auf dem Canvas — nur Pläne in {{workflow_plans}}. ' +
        'Liste die Plan-Titel nummeriert (kurze Titel), sag dass rechts noch nichts gebaut ist, frag: „Womit willst du anfangen?“ ' +
        'und hänge Klick-Buttons an (je ein Button pro Plan-Titel), damit der Nutzer per Klick wählt. ' +
        'Sobald der Nutzer eine Zahl oder einen Titel schreibt: SOFORT build_workflow mit der passenden workflow_id aufrufen — ' +
        'ohne Rückfrage, ohne Bestätigung, Tool zuerst dann Text. ' +
        'KEINE A/B/C, kein Tool-Interview, keine fertigen-Workflows-Behauptung.'
      );
    default:
      return `${SYSTEM_PREFIX} phase=diagnose\nHallo, lass uns starten!`;
  }
}
