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
        'wir schauen, womit sie heute arbeiten, bewerten die Punkte nach Aufwand und Hebel und entwerfen ' +
        'dann pro Punkt den konkreten Ablauf. ' +
        'Dann kurz die potenziellen Verbesserungen recap, danach DIREKT die erste Tool-Frage zum wichtigsten Punkt — ' +
        'im Chat „potenzielle Verbesserung"/„Bereich" sagen, nicht „Pain Point". ' +
        'Arbeite pro Punkt: erst Ist-Tools erfassen (nur konkrete Programmnamen des Nutzers), ' +
        'dann Reihenfolge gemeinsam festlegen, dann pro Punkt den Ablauf entwerfen ' +
        '(Ansatz herleiten → bestätigen lassen → erst dann workflow_plan). ' +
        'Den Workflow-Plan in der Roadmap rechts legst du erst an, wenn der konkrete Ablauf besprochen und bestätigt ist. ' +
        'Nutze für klare Auswahlen Klick-Buttons.'
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
