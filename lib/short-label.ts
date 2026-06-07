/**
 * Kurze, klare Namen für Workflow-Titel und Node-Labels (n8n-Stil: 1–3 Wörter).
 */

/** Bekannte n8n-Node-Typen → kurzer, deutscher Anzeigename. */
const NODE_SHORT_LABELS: Record<string, string> = {
  'n8n-nodes-base.manualTrigger': 'Start',
  'n8n-nodes-base.scheduleTrigger': 'Zeitplan',
  'n8n-nodes-base.webhook': 'Webhook',
  'n8n-nodes-base.httpRequest': 'HTTP',
  'n8n-nodes-base.set': 'Daten setzen',
  'n8n-nodes-base.code': 'Code',
  'n8n-nodes-base.if': 'Wenn/Dann',
  'n8n-nodes-base.switch': 'Verzweigen',
  'n8n-nodes-base.merge': 'Zusammenführen',
  'n8n-nodes-base.gmail': 'Gmail',
  'n8n-nodes-base.slack': 'Slack',
  'n8n-nodes-base.youTube': 'YouTube',
  'n8n-nodes-base.facebookGraphApi': 'Meta',
  'n8n-nodes-base.notion': 'Notion',
  'n8n-nodes-base.airtable': 'Airtable',
  'n8n-nodes-base.googleSheets': 'Sheets',
  'n8n-nodes-base.telegram': 'Telegram',
  '@n8n/n8n-nodes-langchain.openAi': 'KI',
  '@n8n/n8n-nodes-langchain.agent': 'KI-Agent',
  'n8n-nodes-base.openAi': 'KI',
};

const FILLER = /\b(der|die|das|den|dem|und|oder|für|von|mit|zum|zur|eine?|im|in|auf|aus|automatisch|automatisiert|workflow|prozess|schritt)\b/gi;

/**
 * Kürzt ein langes Label auf max. `maxWords` Wörter. Bevorzugt den n8n-Node-Namen,
 * wenn vorhanden — sonst Füllwörter raus + kürzen.
 */
export function shortLabel(
  label: string | undefined | null,
  opts?: { n8nType?: string | null; maxWords?: number; maxChars?: number },
): string {
  const maxWords = opts?.maxWords ?? 3;
  const maxChars = opts?.maxChars ?? 28;

  const raw = (label ?? '').trim();
  if (!raw) {
    return (opts?.n8nType && NODE_SHORT_LABELS[opts.n8nType]) || 'Schritt';
  }

  // Schon kurz genug → unverändert (nur trimmen).
  const words = raw.split(/\s+/);
  if (words.length <= maxWords && raw.length <= maxChars) return raw;

  // Füllwörter entfernen, dann auf maxWords kürzen.
  const cleaned = raw.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  const kept = (cleaned || raw).split(/\s+/).slice(0, maxWords).join(' ');
  if (kept.length <= maxChars) return kept;
  return kept.slice(0, maxChars - 1).trimEnd() + '…';
}

/** Kürzt einen Workflow-Titel (max. 4 Wörter). */
export function shortWorkflowTitle(title: string | undefined | null): string {
  return shortLabel(title, { maxWords: 4, maxChars: 32 });
}

/** Default-Node-Anzeigename für einen bekannten n8n-Typ (oder null). */
export function nodeShortName(n8nType: string | undefined | null): string | null {
  return n8nType ? NODE_SHORT_LABELS[n8nType] ?? null : null;
}
