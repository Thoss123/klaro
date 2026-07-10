import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureBaseRules, personaPath, writeWorkspaceFile } from '@/lib/workspace';
import { loadWorkflowTemplate } from '@/lib/template-loader';
import { upsertBerndConfig } from '@/lib/bernd/config';
import { BERND_TEMPLATES, getTemplateManifest } from '@/lib/bernd/templates';
import type { ActiveTemplate, BerndConfig } from '@/lib/bernd/types';
import type { BerndWizardData } from '@/app/bernd/onboarding/BerndOnboardingWizard';

/**
 * Provisionierung einer Bernd-Instanz aus dem Onboarding-Wizard (Architekturplan §3/§5.2).
 * Baut die Kern-Flows aus den golden Templates (Auswahl + Parametrisierung, keine
 * Freigenerierung), schreibt das Firmenwissen/Persona in den Arbeitsbereich und legt die
 * strukturierte `bernd_configs`-Zeile an — idempotent pro (project_id, Template-Name).
 *
 * Deploy ist fail-open: schlägt n8n fehl (MOCK aus, VPS down, ...), werden Regeln + Config
 * trotzdem geschrieben, damit das Onboarding nie hart abbricht — der Nutzer landet im
 * Dashboard und kann dort nachjustieren/erneut deployen.
 */

const KERN_FLOW_SLUGS = ['angebot-autopilot', 'rechnung-mahnwesen', 'followup-serie', 'email-triage-draft'] as const;

/** n8n-Basis-URL ohne /api/v1 für Webhook-URLs (analog lib/deploy-agent-workflow.ts). */
function n8nWebhookBase(): string {
  return (process.env.N8N_API_URL || '').replace(/\/api\/v1\/?$/, '');
}

/** Kurzer, stabiler Suffix pro Projekt für kollisionsfreie Webhook-Pfade. */
function projectSuffix(projectId: string): string {
  return projectId.replace(/-/g, '').slice(0, 8);
}

function toNumberString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

/** Baut den Firmenwissen-Block (Preise, Prozesse, Zeitfresser) aus Wizard + Freitext-Chat. */
function buildCompanyBaseContent(args: {
  gewerk: string;
  wizardData: BerndWizardData;
  chatNotes?: string;
}): string {
  const { gewerk, wizardData, chatNotes } = args;
  const lines: string[] = [
    '# Firmen-Basiswissen',
    '',
    'Diese Datei ist das gemeinsame Faktenwissen für Bernd (Preise, Prozesse, No-Gos).',
    'Bernd liest sie bei jeder Antwort/jedem Entwurf und ergänzt sie über die Zeit.',
    '',
    '## Gewerk',
    `- ${gewerk}`,
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
    `- Angebots-Prozess: ${wizardData.angebots_prozess || 'nicht angegeben'}`,
    `- Rechnungs-/Mahnwesen-Prozess: ${wizardData.rechnungs_prozess || 'nicht angegeben'}`,
    `- Kommunikationskanäle mit Kunden: ${wizardData.kommunikationskanaele || 'nicht angegeben'}`,
    '',
    '## Zeitfresser (wo Bernd zuerst ansetzt)',
    `- ${wizardData.zeitfresser || 'nicht angegeben'}`,
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

export interface DeployedTemplate {
  slug: string;
  n8nId: string;
  active: boolean;
}

export interface ProvisionResult {
  ok: boolean;
  deployed: DeployedTemplate[];
  config: BerndConfig | null;
  error?: string;
}

/** Skalare für ein Template aus Wizard-Daten + gemeinsamen Werten zusammenstellen. */
function buildScalars(args: {
  slug: string;
  gewerk: string;
  wizardData: BerndWizardData;
  personaFile: string;
  appBaseUrl: string;
  projectId: string;
}): Record<string, string> {
  const { slug, gewerk, wizardData, personaFile, appBaseUrl, projectId } = args;
  const suffix = projectSuffix(projectId);
  const manifest = getTemplateManifest(slug);

  const common: Record<string, string> = {
    APP_BASE_URL: appBaseUrl,
    PROJECT_ID: projectId,
    PERSONA_PATH: personaFile,
    GEWERK: gewerk,
    STUNDENSATZ: toNumberString(wizardData.stundensatz, '0'),
    MATERIALAUFSCHLAG: toNumberString(wizardData.materialaufschlag, '0'),
    ANFAHRTSPAUSCHALE: toNumberString(wizardData.anfahrtspauschale, '0'),
  };

  // Nur Skalare befüllen, die das Template-Manifest tatsächlich für diesen Flow vorsieht.
  const schemaKeys = new Set((manifest?.scalarsSchema ?? []).map((s) => s.key));
  const extra: Record<string, string> = {};
  if (schemaKeys.has('PREISLISTE_TABLE')) extra.PREISLISTE_TABLE = 'preisliste';
  if (schemaKeys.has('FOLLOWUP_TABLE')) extra.FOLLOWUP_TABLE = 'followup_leads';
  if (schemaKeys.has('INVOICE_TABLE')) extra.INVOICE_TABLE = 'rechnungen';
  if (schemaKeys.has('INVOICE_DOC_TEMPLATE_ID')) extra.INVOICE_DOC_TEMPLATE_ID = '';
  if (schemaKeys.has('OWNER_WHATSAPP')) extra.OWNER_WHATSAPP = '';
  if (schemaKeys.has('TWILIO_WHATSAPP_FROM')) extra.TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM?.trim() || '+14155238886';
  if (schemaKeys.has('OFFER_APPROVAL_WEBHOOK_PATH')) extra.OFFER_APPROVAL_WEBHOOK_PATH = `angebot-freigabe-${suffix}`;
  if (schemaKeys.has('ORDER_DONE_WEBHOOK_PATH')) extra.ORDER_DONE_WEBHOOK_PATH = `auftrag-fertig-${suffix}`;

  return { ...common, ...extra };
}

/** Welche Kern-Templates deployt werden — abhängig davon, welche Tools der Betrieb hat. */
function selectTemplateSlugs(wizardData: BerndWizardData): string[] {
  const tools = new Set(
    (wizardData.tools || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  );
  const hasMail = tools.has('gmail') || tools.has('outlook') || tools.size === 0;
  // Ohne festes Mail-Tool ("keine") trotzdem alle Kern-Flows anbieten — Deploy ist fail-open
  // und der Nutzer verbindet sein Postfach ggf. später im Dashboard nach.
  void hasMail;
  return KERN_FLOW_SLUGS.filter((slug) => BERND_TEMPLATES.some((t) => t.slug === slug));
}

/** Baut + deployt einen einzelnen Kern-Flow idempotent (pro (project_id, name)); wirft bei Fehler. */
async function deployOneTemplate(
  supabase: SupabaseClient,
  args: {
    slug: string;
    userId: string;
    projectId: string;
    scalars: Record<string, string>;
  },
): Promise<DeployedTemplate> {
  const { createN8nWorkflow } = await import('@/lib/n8n');
  const { workflow } = loadWorkflowTemplate(args.slug, { scalars: args.scalars });
  const name = String(workflow.name ?? args.slug);

  const { data: existing } = await supabase
    .from('workflows')
    .select('n8n_workflow_id')
    .eq('project_id', args.projectId)
    .eq('name', name)
    .maybeSingle();

  if (existing?.n8n_workflow_id) {
    return { slug: args.slug, n8nId: existing.n8n_workflow_id as string, active: false };
  }

  const created = await createN8nWorkflow(workflow as object);
  const { error: insErr } = await supabase.from('workflows').insert({
    user_id: args.userId,
    project_id: args.projectId,
    name,
    n8n_workflow_id: created.id,
    status: 'inactive', // Onboarding deployt inaktiv — Aktivierung folgt im Dashboard/nach Tool-Connect.
  });
  if (insErr) {
    throw new Error(`DB-Eintrag für "${args.slug}" fehlgeschlagen: ${insErr.message}`);
  }
  return { slug: args.slug, n8nId: created.id, active: false };
}

/**
 * Provisioniert eine komplette Bernd-Instanz: Firmenwissen + Persona schreiben, Kern-Flows
 * aus den golden Templates parametrisiert deployen (inaktiv), Bernd-Config anlegen.
 * Rules+Config werden IMMER geschrieben (fail-open), auch wenn der Deploy-Schritt scheitert.
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
  const { userId, projectId, gewerk, wizardData, chatNotes, appBaseUrl } = args;

  // (a) Firmenwissen + Persona schreiben — passiert immer, unabhängig vom Deploy-Erfolg.
  await ensureBaseRules(supabase, { userId, projectId });
  const companyBaseContent = buildCompanyBaseContent({ gewerk, wizardData, chatNotes });
  await writeWorkspaceFile(supabase, {
    userId,
    projectId,
    path: 'rules/company_base.md',
    content: companyBaseContent,
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

  // (b)+(c) Kern-Flows auswählen, parametrisieren, deployen — best-effort.
  const deployed: DeployedTemplate[] = [];
  let deployError: string | undefined;
  const slugsToTry = selectTemplateSlugs(wizardData);

  for (const slug of slugsToTry) {
    try {
      const scalars = buildScalars({ slug, gewerk, wizardData, personaFile, appBaseUrl, projectId });
      const result = await deployOneTemplate(supabase, { slug, userId, projectId, scalars });
      deployed.push(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[bernd/provision] Deploy von "${slug}" fehlgeschlagen:`, msg);
      deployError = deployError ? `${deployError}; ${slug}: ${msg}` : `${slug}: ${msg}`;
    }
  }

  // (d) Bernd-Config anlegen — Preislogik, Tools, aktive Templates, Steckbrief.
  const activeTemplates: ActiveTemplate[] = deployed.map((d) => ({
    slug: d.slug,
    n8n_workflow_id: d.n8nId,
    scalars: buildScalars({ slug: d.slug, gewerk, wizardData, personaFile, appBaseUrl, projectId }),
  }));

  const kannListe = deployed
    .map((d) => getTemplateManifest(d.slug)?.label ?? d.slug)
    .filter(Boolean);

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
        kommunikationskanaele: (wizardData.kommunikationskanaele || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      },
      active_templates: activeTemplates,
      steckbrief: { kann: kannListe },
    },
  });

  return {
    ok: Boolean(config),
    deployed,
    config,
    error: config ? deployError : 'Bernd-Config konnte nicht gespeichert werden',
  };
}

// Webhook-Basis wird aktuell nicht direkt exportiert benötigt, aber für spätere Nutzung
// (z.B. Steckbrief-Anzeige der Webhook-URLs) hier zentral verfügbar halten.
export { n8nWebhookBase };
