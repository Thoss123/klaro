/**
 * Tool-Empfehlungen — kuratierte Liste bevorzugter Tools je Kategorie.
 *
 * Wird in Phase 2 + 3 in den Coach-Prompt injiziert ({{tool_recommendations}}),
 * damit der Coach konkret empfehlen kann statt nur zu fragen. Kriterien:
 * Cloud-first (n8n-Anbindung), günstiges/hohes Free Tier, EU-Datenschutz wo möglich.
 */

export interface ToolRecommendation {
  /** Bevorzugtes Tool für diese Kategorie. */
  preferred: string;
  /** Kurzbegründung (1 Satz) — warum genau dieses Tool. */
  why: string;
  /** Sinnvolle Alternativen, falls der Nutzer schon etwas anderes hat. */
  alt: string[];
}

export const TOOL_RECOMMENDATIONS: Record<string, ToolRecommendation> = {
  docs:          { preferred: 'Google Docs',   why: 'Cloud, kostenlos, kein Setup, überall verfügbar', alt: ['Notion', 'Word'] },
  spreadsheet:   { preferred: 'Google Sheets',  why: 'Cloud-native, ideal für Automatisierung', alt: ['Excel', 'Airtable'] },
  ai_api:        { preferred: 'Mistral API',    why: 'Hohes Free Tier, EU-Daten (Frankreich), günstig', alt: ['Claude API', 'OpenAI API'] },
  transcription: { preferred: 'Otter.ai',       why: 'Günstig, gute Erkennung, API vorhanden', alt: ['Fireflies', 'Tactiq'] },
  ai_writing:    { preferred: 'Claude.ai',      why: 'Beste Textqualität & Reasoning', alt: ['ChatGPT', 'Mistral Chat'] },
  crm:           { preferred: 'HubSpot Free',   why: 'Kostenloses CRM mit fertiger n8n-Integration', alt: ['Pipedrive', 'Airtable'] },
  project:       { preferred: 'Notion',         why: 'Docs, Datenbank und Aufgaben in einem', alt: ['Trello', 'Asana'] },
  email:         { preferred: 'Gmail',          why: 'Google Workspace, n8n-OAuth fertig', alt: ['Outlook', 'Superhuman'] },
  scheduling:    { preferred: 'Cal.com',        why: 'Open Source, kostenlos, API-first', alt: ['Calendly', 'Google Calendar'] },
  storage:       { preferred: 'Google Drive',   why: 'Cloud, n8n-Anbindung, großzügiges Free Tier', alt: ['Dropbox', 'OneDrive'] },
};

/** Kompakte Liste für den System-Prompt (eine Zeile pro Kategorie). */
export function formatToolRecommendations(): string {
  return Object.entries(TOOL_RECOMMENDATIONS)
    .map(([cat, data]) => `- ${cat}: **${data.preferred}** (${data.why}) — Alternativen: ${data.alt.join(', ')}`)
    .join('\n');
}
