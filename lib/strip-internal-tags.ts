const LEAKED_TOOL_NAMES =
  'build_workflow|edit_workflow|deploy_workflow|test_workflow|create_workflow_plan|research_solutions|prepare_phase|request_credential';

/** Mistral leak: tool name + garbage + raw JSON in delta.content (ohne tool_call-Tags). */
export function stripLeakedToolFragments(text: string): string {
  if (!text) return '';
  let out = text;
  out = out.replace(
    new RegExp(`(?:${LEAKED_TOOL_NAMES})\\s*[^\\{]*\\{[\\s\\S]*?\\}`, 'gi'),
    '',
  );
  out = out.replace(
    /\{\s*"workflow_id"\s*:\s*"[^"]+"\s*,\s*"instruction"\s*:[\s\S]*?\}/gi,
    '',
  );
  out = out.replace(new RegExp(`(?:${LEAKED_TOOL_NAMES})\\b`, 'gi'), '');
  return out;
}

/**
 * Removes internal control tags from coach messages (chat display + API history).
 * Handles streamed/partial tags (e.g. "anvas_update>" when "<trigger_c" was split).
 */
export function stripInternalTags(content: string): string {
  if (!content) return '';

  let text = content;

  const paired = [
    'trigger_canvas_update',
    'phase_complete',
    'prepare_phase',
    'tool_call',
    'request_credential',
    'deploy_workflow',
    'test_workflow',
    'activate_workflow',
    'show_workflows',
    'canvas_update',
    'canvas_built',
    'workflow_plan',
    'stream_reset',
    'options',
    'user_attachments',
  ];
  for (const tag of paired) {
    text = text.replace(
      new RegExp(`<\\s*${tag}\\s*>[\\s\\S]*?(<\\s*\\/\\s*${tag}\\s*>|$)`, 'gi'),
      ''
    );
    text = text.replace(new RegExp(`<\\s*\\/\\s*${tag}\\s*>`, 'gi'), '');
    text = text.replace(new RegExp(`<\\s*${tag}[^>]*>`, 'gi'), '');
  }

  text = text.replace(/<\/?\s*trigger_canvas_update[^>]*>/gi, '');
  text = text.replace(/trigger_canvas_update/gi, '');
  text = text.replace(/<\/?\s*prepare_phase[^>]*>/gi, '');
  text = text.replace(/_canvas_update>/g, '');
  text = text.replace(/anvas_update>/g, '');
  text = text.replace(/<tool_call[\s\S]*$/gi, '');
  text = text.replace(/<canvas_built[\s\S]*$/gi, '');
  text = text.replace(/<workflow_plan[\s\S]*$/gi, '');
  // Dangling/partial <stream_reset …> at end of a still-streaming buffer
  text = text.replace(/<\/?\s*stream_reset[^>]*>/gi, '');
  text = text.replace(/<stream_reset[\s\S]*$/gi, '');
  text = text.replace(/<\/?\s*tool_call[^>]*>/gi, '');
  text = text.replace(/<\/?\s*canvas_built[^>]*>/gi, '');
  text = text.replace(/\{"type":"(?:build_workflow|edit_workflow|deploy_workflow|test_workflow|create_workflow_plan|research_solutions|prepare_phase|request_credential)"[\s\S]*?\}/gi, '');
  text = text.replace(
    /\b(build_workflow|edit_workflow|deploy_workflow|test_workflow|create_workflow_plan)(?=[a-zäöüß])/gi,
    '',
  );
  text = stripLeakedToolFragments(text);

  // Geleakte interne Notiz-Pseudotags: Der Coach erfindet manchmal Klammern wie
  // "<Text für dich: …>", "<Hinweis: …>", "<System: …>" statt (oder neben) des
  // echten canvas_update. Solche Notizen dürfen NIE sichtbar werden.
  const NOTE_OPENERS =
    'text f[üu]r dich|hinweis|notiz|anmerkung|intern(?:e notiz)?|system|f[üu]r dich|nur f[üu]r dich|kontext|info f[üu]r dich|f[üu]r mich|zur info';
  // vollständige Klammer "<opener …>"
  text = text.replace(new RegExp(`<\\s*(?:${NOTE_OPENERS})\\b[^>]*>`, 'gi'), '');
  // während des Streamens angebrochen: "<opener …" ohne schließendes ">"
  text = text.replace(new RegExp(`<\\s*(?:${NOTE_OPENERS})\\b[^>]*$`, 'gi'), '');
  // Allgemeine Pseudo-Notiz-Form "<Wort …: …>" (Buchstaben-Start, ": " im Inneren,
  // kein "="): fängt neu erfundene Varianten, ohne a<b oder <mail@…> zu treffen.
  text = text.replace(/<[A-Za-zÄÖÜäöüß][^>\n=]{0,60}:\s[^>\n]{0,400}>/g, '');
  // Doppelte Leerzeichen mitten im Satz (z.B. wo ein Tag herausgeschnitten wurde)
  // → eins; Einrückungen am Zeilenanfang bleiben unangetastet.
  text = text.replace(/(\S) {2,}(?=\S)/g, '$1 ');

  // Leading "---" renders as horizontal rule in ReactMarkdown
  text = text.replace(/^(\s*---\s*\n?)+/, '');
  text = text.replace(/(\n\s*---\s*)+$/, '');

  // Stray markdown/code fences from the model
  text = text.replace(/^`{1,3}\s*/g, '');
  text = text.replace(/\s*`{1,3}$/g, '');

  text = text.replace(/\([^)]*(?:schon im Canvas|frag nur das, was ich noch nicht weiß)[^)]*\)\s*/gi, '');
  // Mehrfache Leerzeilen zu EINER zusammenfassen — aber den Absatz (Doppel-\n)
  // erhalten: Markdown braucht die Leerzeile, damit Echo und Folgefrage als
  // getrennte Absätze rendern (sonst kleben sie ohne Enter aneinander).
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Cleanup Mistral/KI formatting: fügt fehlende Leerzeichen nach Kommas
 * und vor Zahlen ein (z.B. "Monat,90" → "Monat, 90").
 */
export function cleanupBotFormatting(text: string): string {
  if (!text) return text;

  let cleaned = text;

  // Überschriften → Fließtext: "## …" / "### …" rendert die ChatUI sonst groß
  // (h2/h3). Coach-Nachrichten sollen einheitlich groß sein — nur die #-Marker
  // am Zeilenanfang entfernen, der Text bleibt als normaler Absatz stehen.
  cleaned = cleaned.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '');

  // Komplett fette Zeile ("**ganzer Satz**") → entfetten. Eine Zeile, die NUR aus
  // einem einzigen Fett-Span besteht (keine weiteren `**` darin), ist genau der
  // Fall „ganzer Einstiegssatz fett", den der Nutzer nicht will. Inline-Fett für
  // einzelne Schlüsselwörter (mehrere Spans oder Text drumherum) bleibt erhalten.
  cleaned = cleaned.replace(/^[ \t]*\*\*([^*\n]+)\*\*[ \t]*$/gm, '$1');

  // Leerzeichen nach Komma wenn Ziffer folgt: "Monat,90" → "Monat, 90"
  cleaned = cleaned.replace(/,(\d)/g, ', $1');

  // Leerzeichen vor Ziffer nach schließender Bold/Italic: ":**12" → ": **12"
  cleaned = cleaned.replace(/:\*\*(\d)/g, ': **$1');
  cleaned = cleaned.replace(/:\*(\d)/g, ': *$1');

  return cleaned;
}

