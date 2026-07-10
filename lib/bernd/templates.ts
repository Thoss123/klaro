/**
 * Bernd-Template-Manifest: pro Golden-Flow-Template ein Eintrag mit Parameter-/Tool-Schema.
 * Quelle der Wahrheit bleiben die Dateien unter `knowledge/templates/workflows/` (golden
 * n8n-Export + `.md` mit Frontmatter `tools_required` und Slot-Doku) — dieses Manifest
 * bildet nur ab, welche Slots/Tools das Onboarding braucht, um ein Template auszuwählen
 * und zu parametrisieren (Architekturplan §3).
 *
 * `requiredTools` je Eintrag == Frontmatter `tools_required` der jeweiligen `<slug>.md`.
 * `scalarsSchema` je Eintrag == die unter "Slots" dokumentierten Skalar-Slots (Struct-Slots
 * wie `{{TRIGGER_NODE}}`/`{{SEND_NODE}}` sind KEINE Skalare — die löst `lib/template-loader.ts`
 * über Provider-Wahl auf, nicht über Nutzereingabe).
 */

export interface TemplateScalarSlot {
  /** Slot-Key exakt wie im golden JSON, ohne die `{{ }}`-Klammern (z.B. "STUNDENSATZ"). */
  key: string;
  /** Kurze, nutzerverständliche Beschriftung fürs Onboarding-Formular. */
  label: string;
  /** Beispielwert, der im Onboarding als Platzhalter dient. */
  example: string;
}

export interface BerndTemplateManifestEntry {
  /** Slug == Dateiname ohne Endung unter knowledge/templates/workflows/ (n8n_json_file-Basis). */
  slug: string;
  /** Kurzer, nutzerverständlicher Name fürs Onboarding/Dashboard. */
  label: string;
  /** Anwendungsfall(e), wie im Frontmatter `use_cases` der jeweiligen .md. */
  useCase: string;
  /** Frontmatter `tools_required` der jeweiligen .md (z.B. ["gmail", "twilio"]). */
  requiredTools: string[];
  /** Skalar-Slots, die das Onboarding abfragen muss, um den Flow zu parametrisieren. */
  scalarsSchema: TemplateScalarSlot[];
}

/** Gemeinsame Skalare, die praktisch jeder Flow braucht (Architekturplan §3, Punkt 2). */
const COMMON_SCALARS: TemplateScalarSlot[] = [
  { key: 'APP_BASE_URL', label: 'Axantilo-App-URL', example: 'https://www.axantilo.com' },
  { key: 'PROJECT_ID', label: 'Projekt/Workspace-ID', example: '(automatisch)' },
  { key: 'PERSONA_PATH', label: 'Persona-Regel-Datei', example: 'rules/persona_thomas.md' },
];

export const BERND_TEMPLATES: BerndTemplateManifestEntry[] = [
  {
    slug: 'angebot-autopilot',
    label: 'Angebots-Autopilot',
    useCase: 'angebots-autopilot, anfragen-automatisieren',
    requiredTools: ['gmail', 'twilio'],
    scalarsSchema: [
      ...COMMON_SCALARS,
      {
        key: 'PREISLISTE_TABLE',
        label: 'Tabellenname der Preisliste (Datenablage)',
        example: 'preisliste',
      },
      {
        key: 'FOLLOWUP_TABLE',
        label: 'Tabellenname für Angebots-/Lead-Zeilen (geteilt mit followup-serie)',
        example: 'followup_leads',
      },
      { key: 'OWNER_WHATSAPP', label: 'WhatsApp-Nummer des Inhabers (nackt)', example: '+436601234567' },
      {
        key: 'TWILIO_WHATSAPP_FROM',
        label: 'Twilio-WhatsApp-Absendernummer',
        example: '+14155238886',
      },
      {
        key: 'OFFER_APPROVAL_WEBHOOK_PATH',
        label: 'Webhook-Pfad für die Angebots-Freigabe',
        example: 'angebot-freigabe-abc123',
      },
    ],
  },
  {
    slug: 'rechnung-mahnwesen',
    label: 'Rechnung & Mahnwesen',
    useCase: 'rechnung-mahnwesen-automatisieren',
    requiredTools: ['gmail', 'google_docs', 'google_drive'],
    scalarsSchema: [
      ...COMMON_SCALARS,
      { key: 'INVOICE_TABLE', label: 'Tabellenname für Rechnungen (Datenablage)', example: 'rechnungen' },
      {
        key: 'INVOICE_DOC_TEMPLATE_ID',
        label: 'Google-Docs-Datei-ID der Rechnungsvorlage',
        example: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
      },
      {
        key: 'ORDER_DONE_WEBHOOK_PATH',
        label: 'Webhook-Pfad für "Auftrag erledigt"',
        example: 'auftrag-fertig-abc123',
      },
    ],
  },
  {
    slug: 'followup-serie',
    label: 'Lead-Follow-up-Serie (T3/T7/T14)',
    useCase: 'lead-follow-up-automatisieren, angebot-nachfassen',
    requiredTools: ['gmail'],
    scalarsSchema: [
      ...COMMON_SCALARS,
      {
        key: 'FOLLOWUP_TABLE',
        label: 'Tabellenname für Lead-/Angebots-Zeilen (Datenablage)',
        example: 'followup_leads',
      },
    ],
  },
  {
    slug: 'lead-followup',
    label: 'Lead-Follow-up (einzelne T+3-Mail, veraltet)',
    useCase: 'lead-follow-up-automatisieren',
    requiredTools: ['gmail'],
    // superseded_by: followup-serie (siehe lead-followup.md) — kein eigenes JSON mehr,
    // Eintrag bleibt nur für RAG-Treffer/bestehende Referenzen erhalten.
    scalarsSchema: [...COMMON_SCALARS],
  },
  {
    slug: 'email-triage-draft',
    label: 'E-Mail Triage & Antwort-Entwurf',
    useCase: 'eingehende-mails-beantworten, anfragen-automatisieren',
    requiredTools: ['gmail', 'twilio'],
    scalarsSchema: [
      ...COMMON_SCALARS,
      { key: 'OWNER_WHATSAPP', label: 'WhatsApp-Nummer des Inhabers (nackt)', example: '+436601234567' },
      {
        key: 'TWILIO_WHATSAPP_FROM',
        label: 'Twilio-WhatsApp-Absendernummer',
        example: '+14155238886',
      },
    ],
  },
  {
    slug: 'email-autopilot',
    label: 'E-Mail Autopilot (Postfach-Entwurf, ohne Steuerkanal)',
    useCase: 'eingehende-mails-beantworten, anfragen-automatisieren',
    requiredTools: ['gmail'],
    scalarsSchema: [...COMMON_SCALARS],
  },
  {
    slug: 'email-learning-engine',
    label: 'Learning Engine (lernt aus Entwurf vs. finaler Version)',
    useCase: 'automation-lernt-mit, regeln-aus-feedback',
    requiredTools: [],
    scalarsSchema: [
      { key: 'APP_BASE_URL', label: 'Axantilo-App-URL', example: 'https://www.axantilo.com' },
      { key: 'LEARNING_WEBHOOK_PATH', label: 'Webhook-Pfad dieses Flows', example: 'learning-abc123' },
    ],
  },
  {
    slug: 'whatsapp-control',
    label: 'Steuerkanal: WhatsApp (Freigabe, Revision, Assistent)',
    useCase: 'whatsapp-steuerkanal, freigabe-per-chat, chef-assistent',
    requiredTools: ['twilio', 'gmail'],
    scalarsSchema: [
      ...COMMON_SCALARS,
      { key: 'OWNER_WHATSAPP', label: 'WhatsApp-Nummer des Inhabers (nackt)', example: '+436601234567' },
      {
        key: 'TWILIO_WHATSAPP_FROM',
        label: 'Twilio-WhatsApp-Absendernummer',
        example: '+14155238886',
      },
      { key: 'CONTROL_WEBHOOK_PATH', label: 'Webhook-Pfad dieses Flows', example: 'steuerkanal-abc123' },
      {
        key: 'LEARNING_WEBHOOK_URL',
        label: 'Webhook-URL der Learning Engine',
        example: 'https://n8n.example.com/webhook/learning-abc123',
      },
    ],
  },
  {
    slug: 'faq-chatbot',
    label: 'FAQ-Chatbot (Website/WhatsApp/Slack)',
    useCase: 'faq-chatbot, website-chatbot, kundenfragen-beantworten',
    requiredTools: [],
    scalarsSchema: [
      ...COMMON_SCALARS,
      { key: 'FAQ_WEBHOOK_PATH', label: 'Webhook-Pfad dieses Flows', example: 'faq-abc123' },
    ],
  },
  {
    slug: 'ai-webhook',
    label: 'AI-Webhook (generische KI-Funktionalität)',
    useCase: 'lead-qualifizierung, bewertungs-antwort, social-media-post, ki-webhook',
    requiredTools: [],
    scalarsSchema: [
      ...COMMON_SCALARS,
      { key: 'FN_WEBHOOK_PATH', label: 'Webhook-Pfad dieser Funktionalität', example: 'fn-lead-qualify-abc123' },
      {
        key: 'PROMPT_KEY',
        label: 'Agenten-Prompt-Key (lib/agent-prompts.ts)',
        example: 'tool/lead_qualify',
      },
    ],
  },
];

const TEMPLATE_MAP = new Map(BERND_TEMPLATES.map((t) => [t.slug, t]));

/** Manifest-Eintrag zu einem Slug, oder `undefined` wenn unbekannt. */
export function getTemplateManifest(slug: string): BerndTemplateManifestEntry | undefined {
  return TEMPLATE_MAP.get(slug);
}

/** Alle bekannten Template-Slugs (z.B. fürs Onboarding-"alle Templates anbieten"). */
export function listTemplateSlugs(): string[] {
  return BERND_TEMPLATES.map((t) => t.slug);
}
