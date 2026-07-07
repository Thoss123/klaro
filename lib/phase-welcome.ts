const SYSTEM_PREFIX = '[__axantilo_system__]';

/** Hidden user message that kicks off the coach per phase (not shown in UI, not saved). */
export function getHiddenInitMessage(phase: string): string {
  switch (phase) {
    // Gemergte Phase 2 (Analyse & Plan) — 'plan' nur noch als Legacy-Alias.
    case 'analyse':
    case 'plan':
      return (
        `${SYSTEM_PREFIX} phase=analyse\n` +
        'Starte Phase 2 (Analyse & Plan). Keine Phase-1-Begrüßung, kein „Lass uns gleich starten“, ' +
        'keine Onboarding-Fragen zum Angebot. Sag ZUERST in einem Satz, was diese Phase tut: ' +
        'wir wählen einen Bereich, klären alles Nötige in einem Rutsch, du wählst den Lösungsweg, dann baue ich den Ablauf rechts. ' +
        'Dann die potenziellen Verbesserungen/Bereiche nummeriert recap und DIREKT per options fragen, ' +
        'mit welchem Bereich ihr anfangen sollt — im Chat „Bereich" sagen, nicht „Pain Point". ' +
        'Danach der feste Ablauf: (B) nach der Auswahl ALLE offenen Fragen des Bereichs in EINER mehrteiligen options-Nachricht, ' +
        '(C) konkreten Lösungsweg im Fließtext erklären (bei komplexen Bereichen kein vages A/B/C-options — direkt nummerierter Ablauf), ' +
        '(D) Idee als Wenn-Dann spiegeln und per options bestätigen lassen, (E) bei Ja sofort workflow_plan. ' +
        'JEDE Frage in Phase 2 läuft über options/Klick-Buttons (offene Frage = options ohne choices, nur placeholder), niemals normaler Chattext. ' +
        'Keine Zugangsdaten, kein Popup, kein Deploy in Phase 2.'
      );
    case 'umsetzung':
      return (
        `${SYSTEM_PREFIX} phase=umsetzung\n` +
        'Starte Phase 3 (Umsetzung). Sag ZUERST in einem Satz, was Phase 3 tut: jetzt setzen wir die Pläne ' +
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
