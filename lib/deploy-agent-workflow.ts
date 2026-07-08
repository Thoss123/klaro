import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadWorkflowTemplate,
  type MailProvider,
  type N8nWorkflowJson,
} from '@/lib/template-loader';

/**
 * Richtet die E-Mail-Automation pro User auf Axantilos GETEILTER n8n-Instanz ein.
 *
 * Nimmt die live-getesteten golden Templates, füllt die Slots mit den Daten DIESES Users
 * (Projekt, Mail-Provider, WhatsApp-Nr., Persona), bindet die zentralen Credentials und
 * vergibt pro User eindeutige Webhook-Pfade (damit Steuerkanal/Learning nicht kollidieren).
 *
 * Vom Coach über das Tool `setup_email_automation` aufgerufen. Der Deploy passiert; das
 * ECHTE Laufen braucht zusätzlich, dass der User seinen Mail-Provider verbindet (3-Klick-OAuth).
 */

const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM?.trim() || '+14155238886';

/** Zentrale, für alle User geteilte n8n-Credential-IDs (nie user-sichtbar). */
function centralCredIds() {
  return {
    workspaceToken: process.env.N8N_CREDENTIAL_WORKSPACE_TOKEN?.trim() || '',
    twilio: process.env.N8N_CREDENTIAL_TWILIO?.trim() || '',
  };
}

/** n8n-Basis-URL ohne /api/v1 für Webhook-URLs. */
function n8nWebhookBase(): string {
  return (process.env.N8N_API_URL || '').replace(/\/api\/v1\/?$/, '');
}

/** Kurzer, stabiler Suffix pro Projekt für kollisionsfreie Webhook-Pfade. */
function projectSuffix(projectId: string): string {
  return projectId.replace(/-/g, '').slice(0, 8);
}

export interface DeployEmailAutomationArgs {
  userId: string;
  projectId: string;
  mailProvider: MailProvider;
  ownerWhatsapp: string; // nackte Nummer, z.B. +4367...
  personaPath?: string;
  appBaseUrl: string;
}

export interface BuiltWorkflow {
  slug: string;
  name: string;
  workflow: N8nWorkflowJson;
}

/** Mail-Node-Typen → Credential-Typ-Schlüssel (für die Credential-Bindung). */
const MAIL_CRED_KEY: Record<MailProvider, string> = {
  gmail: 'gmailOAuth2',
  outlook: 'microsoftOutlookOAuth2Api',
  imap: 'imap',
};

/** n8n-Credential-ID des Users für ein bestimmtes Tool (falls verbunden). */
async function findCredentialByTool(
  supabase: SupabaseClient,
  projectId: string,
  toolName: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('user_credentials')
    .select('n8n_credential_id')
    .eq('project_id', projectId)
    .eq('tool_name', toolName)
    .eq('status', 'active')
    .maybeSingle();
  return (data?.n8n_credential_id as string | undefined) ?? null;
}

/** n8n-Credential-ID des Users für seinen Mail-Provider (falls schon verbunden). */
function findMailCredential(
  supabase: SupabaseClient,
  projectId: string,
  provider: MailProvider,
): Promise<string | null> {
  const toolName = provider === 'gmail' ? 'gmail' : provider === 'outlook' ? 'outlook' : 'imap';
  return findCredentialByTool(supabase, projectId, toolName);
}

/**
 * Bindet Credentials an die Nodes (rein nach Node-Typ) — keine user-sichtbaren Credential-
 * Felder, die IDs kommen aus zentraler Config bzw. dem verbundenen Mail-Konto des Users.
 */
function bindCredentials(
  workflow: N8nWorkflowJson,
  opts: {
    workspaceToken: string;
    twilio: string;
    mailCredId: string | null;
    mailProvider: MailProvider;
    calendarCredId: string | null;
  },
): void {
  const mailCredKey = MAIL_CRED_KEY[opts.mailProvider];
  for (const node of workflow.nodes ?? []) {
    const type = String(node.type);
    const setCred = (key: string, id: string) => {
      if (!id) return;
      node.credentials = { ...(node.credentials as Record<string, unknown> | undefined), [key]: { id, name: key } };
    };
    if (type === 'n8n-nodes-base.httpRequest') {
      // Nur App-Calls nutzen Header-Auth; der generische Auth-Typ steht in den Parametern.
      const p = node.parameters as { genericAuthType?: string } | undefined;
      if (p?.genericAuthType === 'httpHeaderAuth') setCred('httpHeaderAuth', opts.workspaceToken);
    } else if (type === 'n8n-nodes-base.twilio') {
      setCred('twilioApi', opts.twilio);
    } else if (type === 'n8n-nodes-base.googleCalendar') {
      // Kalender ist im golden disabled; nur aktivieren + binden, wenn der User ihn verbunden hat.
      if (opts.calendarCredId) {
        setCred('googleCalendarOAuth2Api', opts.calendarCredId);
        node.disabled = false;
      }
    } else if (
      type.startsWith('n8n-nodes-base.gmail') ||
      type.startsWith('n8n-nodes-base.microsoftOutlook') ||
      type === 'n8n-nodes-base.emailReadImap' ||
      type === 'n8n-nodes-base.emailSend'
    ) {
      if (opts.mailCredId) setCred(mailCredKey, opts.mailCredId);
    }
  }
}

/** Baut die drei Workflows für einen User (Slots gefüllt, Credentials gebunden). */
export async function buildEmailAutomation(
  supabase: SupabaseClient,
  args: DeployEmailAutomationArgs,
): Promise<BuiltWorkflow[]> {
  const suffix = projectSuffix(args.projectId);
  const controlPath = `wa-${suffix}`;
  const learningPath = `learn-${suffix}`;
  const persona = args.personaPath || 'rules/persona_default.md';
  const { workspaceToken, twilio } = centralCredIds();
  const mailCredId = await findMailCredential(supabase, args.projectId, args.mailProvider);
  const calendarCredId = await findCredentialByTool(supabase, args.projectId, 'google_calendar');

  const commonScalars = {
    APP_BASE_URL: args.appBaseUrl,
    PROJECT_ID: args.projectId,
    PERSONA_PATH: persona,
    OWNER_WHATSAPP: args.ownerWhatsapp,
    TWILIO_WHATSAPP_FROM,
    CONTROL_WEBHOOK_PATH: controlPath,
    LEARNING_WEBHOOK_PATH: learningPath,
    LEARNING_WEBHOOK_URL: `${n8nWebhookBase()}/webhook/${learningPath}`,
  };

  const specs: Array<{ slug: string }> = [
    { slug: 'email-triage-draft' },
    { slug: 'whatsapp-control' },
    { slug: 'email-learning-engine' },
  ];

  const built: BuiltWorkflow[] = [];
  for (const spec of specs) {
    const { workflow } = loadWorkflowTemplate(spec.slug, {
      mailProvider: args.mailProvider,
      scalars: commonScalars,
    });
    bindCredentials(workflow, { workspaceToken, twilio, mailCredId, mailProvider: args.mailProvider, calendarCredId });
    built.push({ slug: spec.slug, name: String(workflow.name ?? spec.slug), workflow });
  }
  return built;
}

export interface DeployResult {
  slug: string;
  name: string;
  n8nId: string;
  active: boolean;
}

/**
 * Baut + deployt die E-Mail-Automation in die geteilte n8n-Instanz (idempotent pro
 * Projekt via workflows-Tabelle: vorhandene werden aktualisiert statt dupliziert).
 */
export async function deployEmailAutomation(
  supabase: SupabaseClient,
  args: DeployEmailAutomationArgs,
): Promise<{ ok: boolean; workflows: DeployResult[]; mailConnected: boolean; error?: string }> {
  const { createN8nWorkflow, saveN8nWorkflowDefinition, activateN8nWorkflow } = await import('@/lib/n8n');
  const built = await buildEmailAutomation(supabase, args);
  const mailConnected = Boolean(await findMailCredential(supabase, args.projectId, args.mailProvider));
  const results: DeployResult[] = [];

  for (const b of built) {
    // Idempotenz: haben wir diesen Workflow für dieses Projekt schon deployt?
    const { data: existing } = await supabase
      .from('workflows')
      .select('n8n_workflow_id')
      .eq('project_id', args.projectId)
      .eq('name', b.name)
      .maybeSingle();

    let n8nId: string;
    if (existing?.n8n_workflow_id) {
      n8nId = existing.n8n_workflow_id as string;
      // Plain speichern (kein Publish) — funktioniert auch ohne verbundenes Postfach.
      await saveN8nWorkflowDefinition(n8nId, b.workflow as object);
    } else {
      const created = await createN8nWorkflow(b.workflow as object);
      n8nId = created.id;
      const { error: insErr } = await supabase.from('workflows').insert({
        user_id: args.userId,
        project_id: args.projectId,
        name: b.name,
        n8n_workflow_id: n8nId,
        status: mailConnected ? 'active' : 'inactive', // check erlaubt active|inactive|error|draft
      });
      if (insErr) {
        console.error('[deploy-agent] workflows insert failed:', insErr.message);
        return { ok: false, workflows: results, mailConnected, error: `DB-Eintrag fehlgeschlagen: ${insErr.message}` };
      }
    }
    // Aktivieren erst, wenn das Postfach verbunden ist — sonst lehnt n8n das Publishen ab
    // (fehlende Pflicht-Credentials). Ohne Postfach bleibt der Workflow angelegt, aber inaktiv.
    if (mailConnected) await activateN8nWorkflow(n8nId).catch(() => undefined);
    results.push({ slug: b.slug, name: b.name, n8nId, active: mailConnected });
  }

  return { ok: true, workflows: results, mailConnected };
}
