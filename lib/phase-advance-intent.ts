/**
 * Erkennt, wenn der Nutzer explizit die nächste Phase will (nicht nur „weiter im Gespräch“).
 */

function hasExplicitAdvancePhrase(text: string): boolean {
  return (
    /n[aä]chste\s+phase/i.test(text) ||
    /phase\s+wechseln?/i.test(text) ||
    /\b(zur|in die)\s+umsetzung\b/i.test(text) ||
    /\bplan\s+(fertig|abgeschlossen|durch)\b/i.test(text) ||
    /\bjetzt\s+umsetzung\b/i.test(text)
  );
}

function hasWorkflowsReadyAdvance(text: string): boolean {
  return (
    /\bworkflow/i.test(text) &&
    /\b(fertig|abgeschlossen|bereit|fertig\s+geh)/i.test(text) &&
    /\b(weiter|n[aä]chste|phase|umsetzung|man)\b/i.test(text)
  );
}

/** Kurze Nachrichten wie „Weiter“ / „NÄCHSTE PHASE“ in Phase Plan. */
export function detectPhaseAdvanceIntent(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;

  if (hasExplicitAdvancePhrase(t)) return true;
  if (hasWorkflowsReadyAdvance(t)) return true;
  if (/^weiter[!.?\s]*$/i.test(t)) return true;
  if (/^(los|go|continue)[!.?\s]*$/i.test(t)) return true;
  if (/\bgeh\s+weiter\b/i.test(t) || /\bkomm\s+weiter\b/i.test(t)) return true;
  if (/\bjetzt\s+weiter\b/i.test(t)) return true;

  return false;
}
