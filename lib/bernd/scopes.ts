/**
 * Feste Zuordnung der Setup-Chat-Scope-IDs (Zeitfresser, die der Nutzer im v2-Onboarding
 * wählt) zu den golden Workflow-Template-Slugs aus `lib/bernd/templates.ts`. Der Setup-Chat
 * und das Profil-Canvas kennen nur die kurzen Scope-IDs (z.B. "email_triage"); erst beim
 * "Bernd einstellen"-Deployment (WP5) wird über diese Map auf `deployTemplateWorkflow`
 * aufgelöst.
 */

/** Scope-ID → golden Template-Slug (Dateiname unter `knowledge/templates/workflows/`). */
export const SCOPE_TO_SLUG: Record<string, string> = {
  email_triage: 'email-triage-draft',
  angebot: 'angebot-autopilot',
  rechnung: 'rechnung-mahnwesen',
  followup: 'followup-serie',
};

/** Alle bekannten Scope-IDs, feste Reihenfolge für Setup-Chat und Profil-Canvas. */
export const SETUP_SCOPE_IDS = Object.keys(SCOPE_TO_SLUG);

/** Kurze, nutzerverständliche Labels je Scope fürs Setup-Chat (`<options>`) und Canvas. */
export const SCOPE_LABELS: Record<string, string> = {
  email_triage: 'Kunden-E-Mails bearbeiten und beantworten',
  angebot: 'Angebote erstellen',
  rechnung: 'Rechnungen & Mahnungen',
  followup: 'Angebote nachfassen',
};

/** Golden Template-Slug zu einer Scope-ID, oder `null` wenn die Scope-ID unbekannt ist. */
export function slugForScope(id: string): string | null {
  return SCOPE_TO_SLUG[id] ?? null;
}
