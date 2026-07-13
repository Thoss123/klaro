import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureBaseRules, personaPath, writeWorkspaceFile } from '@/lib/workspace';
import { projectSuffix } from '@/lib/template-deploy';
import { upsertBerndConfig, upsertBerndSetupState } from '@/lib/bernd/config';
import { getTemplateManifest } from '@/lib/bernd/templates';
import { parseMultiValue } from '@/lib/onboarding-multi';
import { researchCompany } from '@/lib/company-research';
import { generateInitialStrategy } from '@/lib/strategy';
import type { BerndConfig, SetupScope } from '@/lib/bernd/types';
import type { OnboardingData } from '@/lib/types';
import type { BerndWizardData } from '@/app/bernd/onboarding/BerndOnboardingWizard';

/**
 * Provisionierung einer Bernd-Instanz aus dem Onboarding-Wizard (Architekturplan §3/§5.2,
 * WP5 überarbeitet). Schreibt NUR NOCH Firmenwissen/Persona in den Arbeitsbereich und legt
 * `bernd_configs` im Status 'draft' an, vorbefüllt mit `setup_state` aus dem Wizard-Vorwissen —
 * deployt NICHTS mehr.
 *
 * Der frühere Auto-Deploy hier (`deployOneTemplate`) rief `loadWorkflowTemplate` OHNE
 * `mailProvider` auf, sodass jedes golden Template an ungefüllten `{{TRIGGER_NODE}}`/
 * `{{SEND_NODE}}`-Slots warf und `active_templates` immer leer blieb — und umging den fähigen
 * Deploy-Pfad (`lib/template-deploy.ts#deployTemplateWorkflow`), den der Coach bereits nutzt.
 * Das echte Deployment passiert jetzt ausschließlich über den "Bernd einstellen"-Klick am Ende
 * des Setup-Chats (`app/api/bernd/deploy/route.ts`), der zuerst das Completion-Gate prüft
 * (`lib/bernd/gate.ts`) und danach `deployTemplateWorkflow` für jeden im Setup-Chat GEWÄHLTEN
 * Scope aufruft — nie mehr für alle Kern-Flows blind.
 *
 * Rules+Config werden hier weiterhin IMMER geschrieben (fail-open) — es gibt an dieser Stelle
 * aber nichts mehr, das an n8n scheitern könnte, da kein n8n-Call mehr stattfindet.
 */

/** Golden-Flow-Slugs, die Bernd grundsätzlich anbietet (Doku/Referenz für den Setup-Chat und
 *  `lib/bernd/scopes.ts#SCOPE_TO_SLUG`) — Deploy passiert nur noch über die im Setup-Chat
 *  gewählten Scopes, siehe `app/api/bernd/deploy/route.ts`. */
export const KERN_FLOW_SLUGS = ['angebot-autopilot', 'rechnung-mahnwesen', 'followup-serie', 'email-triage-draft'] as const;

/**
 * Wizard-Zeitfresser-Freitextwerte (siehe `ZEITFRESSER_OPTIONS` in `BerndOnboardingWizard.tsx`)
 * → Scope-ID aus `lib/bernd/scopes.ts` (SCOPE_TO_SLUG-Keys). Nur eindeutige Treffer werden als
 * "vorgeschlagen" vorbefüllt — Zeitfresser ohne golden-Flow-Entsprechung (Terminkoordination,
 * Telefon während der Arbeit, Material-/Lieferschein-Ablage) bleiben unberücksichtigt.
 */
const ZEITFRESSER_TO_SCOPE: Record<string, string> = {
  'Angebote schreiben': 'angebot',
  'Rechnungen und Mahnwesen': 'rechnung',
  'Kunden nachfassen': 'followup',
  'Mails beantworten': 'email_triage',
};

/** Aus dem Wizard-Zeitfresser-Freitext vorgeschlagene Scopes ableiten (status "vorgeschlagen") —
 *  das Vorwissen, das der Setup-Chat dem Nutzer direkt bestätigen lässt statt neu zu fragen. */
function zeitfresserToProposedScopes(zeitfresser?: string): SetupScope[] {
  const ids = new Set<string>();
  for (const value of parseMultiValue(zeitfresser)) {
    const scopeId = ZEITFRESSER_TO_SCOPE[value];
    if (scopeId) ids.add(scopeId);
  }
  return Array.from(ids, (id) => ({ id, status: 'vorgeschlagen' as const }));
}

function initialScopes(wizardData: BerndWizardData): SetupScope[] {
  if (wizardData.start_scope) return [{ id: wizardData.start_scope, status: 'gewaehlt' }];
  return zeitfresserToProposedScopes(wizardData.zeitfresser);
}

function resolveMailProvider(wizardData: BerndWizardData): 'gmail' | 'outlook' | null {
  const tools = parseMultiValue(wizardData.tools);
  if (tools.includes('outlook')) return 'outlook';
  if (tools.includes('gmail')) return 'gmail';
  return null;
}

const START_SCOPE_LABELS: Record<string, string> = {
  email_triage: 'Kunden-E-Mails bearbeiten und beantworten',
  angebot: 'Angebote vorbereiten',
  rechnung: 'Rechnungen und Mahnungen vorbereiten',
  followup: 'Bei offenen Angeboten nachfassen',
};

function toOnboardingData(wizardData: BerndWizardData, recherche: string | null): Partial<OnboardingData> {
  return {
    ziel: wizardData.start_scope ? START_SCOPE_LABELS[wizardData.start_scope] : 'Einen belastenden Büroablauf automatisieren',
    ki_erfahrung: 'noch nicht erhoben',
    wer_setzt_um: wizardData.rolle_im_unternehmen || 'noch nicht erhoben',
    hindernis: wizardData.bedenken || 'noch nicht angegeben',
    branche: wizardData.gewerk || 'Handwerk',
    tempo: 'Schritt für Schritt mit Freigaben',
    unternehmensgroesse: wizardData.unternehmensgroesse || 'noch nicht angegeben',
    technik_level: 'wird im Einrichtungsgespräch berücksichtigt',
    vorname: wizardData.vorname,
    firmenname: wizardData.firmenname,
    rolle_im_unternehmen: wizardData.rolle_im_unternehmen,
    firmen_website: wizardData.firmen_website,
    firmen_recherche: recherche || undefined,
  };
}

function fallbackStrategy(wizardData: BerndWizardData, recherche: string | null): string {
  const scope = wizardData.start_scope ? START_SCOPE_LABELS[wizardData.start_scope] : 'noch offen';
  return [
    '# Einrichtungsstrategie für Bernd',
    '',
    `Unternehmen: ${wizardData.firmenname || 'noch nicht angegeben'}`,
    `Ansprechpartner: ${wizardData.vorname || 'noch nicht angegeben'}`,
    `Rolle: ${wizardData.rolle_im_unternehmen || 'noch nicht angegeben'}`,
    `Gewerk: ${wizardData.gewerk || 'noch nicht angegeben'}`,
    `Teamgröße: ${wizardData.unternehmensgroesse || 'noch nicht angegeben'}`,
    `Erster Einrichtungsbereich: ${scope}`,
    `Bedenken: ${wizardData.bedenken || 'keine angegeben'}`,
    '',
    '## Vorgehen',
    '1. Den heutigen Ablauf und alle Ausnahmen verständlich klären.',
    '2. Wissensquellen, Freigaben und Sicherheitsgrenzen festlegen.',
    '3. Nur die für diesen Einrichtungsbereich notwendigen Konten verbinden.',
    '4. Den Ablauf testen und erst nach ausdrücklicher Bestätigung aktivieren.',
    ...(recherche ? ['', '## Recherche', recherche] : []),
  ].join('\n');
}

function toNumberString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

/** Baut das bestätigte Firmenwissen aus Wizard, Recherche und Strategie. */
function buildCompanyBaseContent(args: {
  gewerk: string;
  wizardData: BerndWizardData;
  chatNotes?: string;
  recherche?: string | null;
  strategy?: string | null;
}): string {
  const { gewerk, wizardData, chatNotes, recherche, strategy } = args;
  const lines: string[] = [
    '# Firmen-Basiswissen',
    '',
    'Diese Datei ist das gemeinsame Faktenwissen für Bernd (Preise, Prozesse, No-Gos).',
    'Bernd liest sie bei jeder Antwort/jedem Entwurf und ergänzt sie über die Zeit.',
    '',
    '## Gewerk',
    `- ${gewerk}`,
    '',
    '## Unternehmen',
    `- Firmenname: ${wizardData.firmenname || 'nicht angegeben'}`,
    `- Website: ${wizardData.firmen_website || 'nicht angegeben'}`,
    `- Ansprechpartner: ${wizardData.vorname || 'nicht angegeben'}`,
    `- Rolle: ${wizardData.rolle_im_unternehmen || 'nicht angegeben'}`,
    `- Teamgröße: ${wizardData.unternehmensgroesse || 'nicht angegeben'}`,
    '',
    '## Preislogik',
    ...(wizardData.stundensatz?.trim()
      ? [
          `- Stundensatz: ${toNumberString(wizardData.stundensatz, 'noch nicht angegeben')} €`,
          `- Materialaufschlag: ${toNumberString(wizardData.materialaufschlag, 'noch nicht angegeben')} %`,
          `- Anfahrtspauschale: ${toNumberString(wizardData.anfahrtspauschale, 'keine')} €`,
        ]
      : ['- Preislogik: noch nicht hinterlegt — Bernd soll den Nutzer beim ersten passenden Anlass danach fragen.']),
    '',
    '## Prozesse',
    `- Auftragsarten: ${wizardData.auftragsarten || 'nicht angegeben'}`,
    `- Kommunikationskanäle mit Kunden: ${wizardData.kommunikationskanaele || 'nicht angegeben'}`,
    '',
    '## Erster Einrichtungsbereich',
    `- ${wizardData.start_scope ? START_SCOPE_LABELS[wizardData.start_scope] : wizardData.zeitfresser || 'nicht angegeben'}`,
    '',
    '## Bedenken vor der Einrichtung',
    `- ${wizardData.bedenken || 'keine angegeben'}`,
    '',
    '## Tools im Einsatz',
    `- ${wizardData.tools || 'nicht angegeben'}`,
    '',
    '## No-Gos',
    '- (wird automatisch befüllt)',
  ];
  if (chatNotes?.trim()) {
    lines.push('', '## Ergänzungen aus dem Onboarding-Chat', chatNotes.trim());
  }
  if (recherche?.trim()) lines.push('', '## Automatische Unternehmensrecherche', recherche.trim());
  if (strategy?.trim()) lines.push('', '## Einrichtungsstrategie', strategy.trim());
  return lines.join('\n');
}

/** Persona-Grundgerüst (Ton, Ansprache) für die neue Bernd-Instanz. */
function buildPersonaContent(gewerk: string): string {
  return `# Persona: Bernd

Du bist Bernd, der digitale Mitarbeiter eines Handwerksbetriebs (${gewerk}). Antworte direkt,
freundlich, per "du" gegenüber dem Inhaber — bei Kundenkontakt sachlich-professionell.
Erfinde keine Preise oder Zusagen, die nicht im Firmen-Basiswissen stehen.
`;
}

export interface ProvisionArgs {
  userId: string;
  projectId: string;
  gewerk: string;
  wizardData: BerndWizardData;
  chatNotes?: string;
  appBaseUrl: string;
}

export interface ProvisionResult {
  ok: boolean;
  config: BerndConfig | null;
  error?: string;
}

export interface ScalarsForSlugArgs {
  /** Slug des golden Templates in knowledge/templates/workflows/<slug>.json. */
  slug: string;
  gewerk: string;
  /** Workspace-Pfad der Persona-Regel-Datei (siehe `lib/workspace.ts#personaPath`). */
  personaFile: string;
  appBaseUrl: string;
  projectId: string;
  /** Freiform-Overrides (z.B. aus setup_state.ablauf-Antworten) — gewinnen gegen die
   *  generischen Defaults unten. */
  overrides?: Record<string, string>;
}

/**
 * Skalare für ein golden Template zusammenstellen — generisch nach Slug + Manifest-Schema
 * (`lib/bernd/templates.ts#getTemplateManifest`), damit sowohl `provisionBernd` als auch die
 * Deploy-Route (`app/api/bernd/deploy/route.ts`) dieselbe Slot-Logik nutzen, statt sie zweimal
 * zu pflegen. Nur Skalare befüllen, die das jeweilige Template-Manifest für diesen Flow
 * vorsieht — überzählige Skalare sind harmlos (werden von
 * `lib/template-loader.ts#applySlots` ignoriert, wenn kein `{{KEY}}` im golden JSON existiert),
 * ein fehlender, im JSON tatsächlich genutzter Skalar lässt den Loader dagegen werfen.
 */
export function buildScalarsForSlug(args: ScalarsForSlugArgs): Record<string, string> {
  const { slug, gewerk, personaFile, appBaseUrl, projectId, overrides = {} } = args;
  const suffix = projectSuffix(projectId);
  const manifest = getTemplateManifest(slug);

  const common: Record<string, string> = {
    APP_BASE_URL: appBaseUrl,
    PROJECT_ID: projectId,
    PERSONA_PATH: personaFile,
    GEWERK: gewerk,
    STUNDENSATZ: '0',
    MATERIALAUFSCHLAG: '0',
    ANFAHRTSPAUSCHALE: '0',
  };

  const schemaKeys = new Set((manifest?.scalarsSchema ?? []).map((s) => s.key));
  const extra: Record<string, string> = {};
  if (schemaKeys.has('PREISLISTE_TABLE')) extra.PREISLISTE_TABLE = 'preisliste';
  if (schemaKeys.has('FOLLOWUP_TABLE')) extra.FOLLOWUP_TABLE = 'followup_leads';
  if (schemaKeys.has('INVOICE_TABLE')) extra.INVOICE_TABLE = 'rechnungen';
  if (schemaKeys.has('INVOICE_DOC_TEMPLATE_ID')) extra.INVOICE_DOC_TEMPLATE_ID = '';
  if (schemaKeys.has('OWNER_WHATSAPP')) extra.OWNER_WHATSAPP = '';
  if (schemaKeys.has('TWILIO_WHATSAPP_FROM')) {
    extra.TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM?.trim() || '+14155238886';
  }
  if (schemaKeys.has('OFFER_APPROVAL_WEBHOOK_PATH')) extra.OFFER_APPROVAL_WEBHOOK_PATH = `angebot-freigabe-${suffix}`;
  if (schemaKeys.has('ORDER_DONE_WEBHOOK_PATH')) extra.ORDER_DONE_WEBHOOK_PATH = `auftrag-fertig-${suffix}`;
  if (schemaKeys.has('EMAIL_SEND_WEBHOOK_PATH')) extra.EMAIL_SEND_WEBHOOK_PATH = `email-send-${suffix}`;

  return { ...common, ...extra, ...overrides };
}

/**
 * Provisioniert eine neue Bernd-Instanz beim Onboarding-Abschluss: Firmenwissen + Persona in
 * den Arbeitsbereich schreiben, `bernd_configs` im Status 'draft' anlegen und `setup_state` mit
 * dem Vorwissen aus dem Wizard vorbefüllen (Gewerk + aus den Zeitfressern abgeleitete
 * vorgeschlagene Scopes) — der Setup-Chat (WP2) baut direkt darauf auf, statt bei null
 * anzufangen. Deployt nichts (siehe Datei-Kommentar oben).
 */
export async function provisionBernd(
  supabase: SupabaseClient,
  args: {
    userId: string;
    projectId: string;
    gewerk: string;
    wizardData: BerndWizardData;
    chatNotes?: string;
    appBaseUrl: string;
  },
): Promise<ProvisionResult> {
  const { userId, projectId, gewerk, wizardData, chatNotes } = args;

  // (a) Recherche + Strategie wie im Axantilo-Onboarding, aber fail-open.
  const recherche = await researchCompany(
    wizardData.firmenname || '',
    gewerk,
    wizardData.firmen_website,
  ).catch((error) => {
    console.warn('[bernd/provision] Firmenrecherche fehlgeschlagen:', error instanceof Error ? error.message : String(error));
    return null;
  });
  const generatedStrategy = await generateInitialStrategy({
    onboarding: toOnboardingData(wizardData, recherche),
    recherche,
  });
  const strategy = generatedStrategy?.trim() || fallbackStrategy(wizardData, recherche);

  const { error: strategyError } = await supabase
    .from('projects')
    .update({ strategy, strategy_updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('user_id', userId);
  if (strategyError) console.warn('[bernd/provision] Strategie konnte nicht im Projekt gespeichert werden:', strategyError.message);

  await ensureBaseRules(supabase, { userId, projectId, strategy });
  const companyBaseContent = buildCompanyBaseContent({ gewerk, wizardData, chatNotes, recherche, strategy });
  await writeWorkspaceFile(supabase, {
    userId,
    projectId,
    path: 'rules/company_base.md',
    content: companyBaseContent,
    updatedBy: 'bernd_onboarding',
  });
  await writeWorkspaceFile(supabase, {
    userId,
    projectId,
    path: 'rules/strategy.md',
    content: strategy,
    updatedBy: 'bernd_onboarding',
  });

  const personaFile = personaPath(gewerk || 'default');
  await writeWorkspaceFile(supabase, {
    userId,
    projectId,
    path: personaFile,
    content: buildPersonaContent(gewerk),
    updatedBy: 'bernd_onboarding',
  });

  // (b) Bernd-Config anlegen — Status draft, Preislogik/Tools als reiner Anzeige-Stand.
  const config = await upsertBerndConfig(supabase, {
    userId,
    projectId,
    patch: {
      gewerk,
      status: 'draft',
      preislogik: {
        stundensatz: toNumberString(wizardData.stundensatz, ''),
        materialaufschlag: toNumberString(wizardData.materialaufschlag, ''),
        anfahrtspauschale: toNumberString(wizardData.anfahrtspauschale, ''),
      },
      tools: {
        genutzt: (wizardData.tools || '').split(',').map((t) => t.trim()).filter(Boolean),
        mail_provider: resolveMailProvider(wizardData),
        kommunikationskanaele: (wizardData.kommunikationskanaele || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      },
    },
  });

  if (!config) {
    return { ok: false, config: null, error: 'Bernd-Config konnte nicht gespeichert werden' };
  }

  // (c) setup_state mit dem Wizard-Vorwissen vorbefüllen — der Setup-Chat (WP2) liest das
  // direkt wieder aus, statt den Nutzer erneut nach schon Bekanntem zu fragen.
  await upsertBerndSetupState(supabase, {
    userId,
    projectId,
    patch: {
      profil: {
        gewerk,
        firmenname: wizardData.firmenname,
        mitarbeiter: wizardData.unternehmensgroesse,
        ansprechpartner: wizardData.vorname,
        rolle: wizardData.rolle_im_unternehmen,
        website: wizardData.firmen_website,
      },
      scopes: initialScopes(wizardData),
      fortschritt: { betrieb: 100, aufgaben: wizardData.start_scope ? 100 : 0, wissen: 0, regeln: 0 },
    },
  });

  return { ok: true, config };
}
