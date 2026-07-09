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

/**
 * approvalMode:
 *  - 'draft' (Default): eigenständig, Entwurf landet im Postfach — KEIN Steuerkanal nötig.
 *  - 'whatsapp': Entwurf geht per WhatsApp zur Freigabe (braucht den Steuerkanal + Twilio).
 */
export type ApprovalMode = 'draft' | 'whatsapp';

export interface DeployEmailAutomationArgs {
  userId: string;
  projectId: string;
  mailProvider: MailProvider;
  ownerWhatsapp?: string; // nur für approvalMode 'whatsapp'
  personaPath?: string;
  appBaseUrl: string;
  approvalMode?: ApprovalMode;
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
    OWNER_WHATSAPP: args.ownerWhatsapp ?? '',
    TWILIO_WHATSAPP_FROM,
    CONTROL_WEBHOOK_PATH: controlPath,
    LEARNING_WEBHOOK_PATH: learningPath,
    LEARNING_WEBHOOK_URL: `${n8nWebhookBase()}/webhook/${learningPath}`,
  };

  // Draft-Modus (Default): nur der eigenständige Autopilot — kein Steuerkanal, kein Twilio.
  // WhatsApp-Modus: Triage (mit WhatsApp-Freigabe) + Steuerkanal + Learning Engine.
  const specs: Array<{ slug: string }> =
    (args.approvalMode ?? 'draft') === 'whatsapp'
      ? [{ slug: 'email-triage-draft' }, { slug: 'whatsapp-control' }, { slug: 'email-learning-engine' }]
      : [{ slug: 'email-autopilot' }];

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

/**
 * Generische AI-Webhook-Funktionalitäten: alle laufen SOFORT (Webhook → KI → Antwort),
 * ohne Postfach/OAuth. Jede = eigener Prompt + eigener Webhook-Pfad. Neue Funktionalität =
 * neuer Prompt in agent-prompts.ts + ein Eintrag hier (kein neues Workflow-JSON nötig).
 */
export const AI_TOOL_FUNCTIONS = {
  lead_qualify: { promptKey: 'tool/lead_qualify', label: 'Lead-Qualifizierung' },
  review_response: { promptKey: 'tool/review_response', label: 'Bewertungs-Antwort' },
  social_post: { promptKey: 'tool/social_post', label: 'Social-Media-Post' },
} as const;

export type AiToolFunction = keyof typeof AI_TOOL_FUNCTIONS;

export interface DeployAiToolArgs {
  userId: string;
  projectId: string;
  functionality: AiToolFunction;
  personaPath?: string;
  appBaseUrl: string;
}

/** Baut eine generische AI-Webhook-Funktionalität mit gefülltem Prompt-Key + Credential. */
export function buildAiTool(args: DeployAiToolArgs): BuiltWorkflow {
  const fn = AI_TOOL_FUNCTIONS[args.functionality];
  const { workspaceToken } = centralCredIds();
  const webhookPath = `${args.functionality.replace(/_/g, '-')}-${projectSuffix(args.projectId)}`;
  const { workflow } = loadWorkflowTemplate('ai-webhook', {
    scalars: {
      FN_WEBHOOK_PATH: webhookPath,
      PROMPT_KEY: fn.promptKey,
      APP_BASE_URL: args.appBaseUrl,
      PROJECT_ID: args.projectId,
      PERSONA_PATH: args.personaPath || 'rules/persona_default.md',
    },
  });
  workflow.name = `AXANTILO: ${fn.label}`;
  bindCredentials(workflow, { workspaceToken, twilio: '', mailCredId: null, mailProvider: 'gmail', calendarCredId: null });
  return { slug: `ai-webhook:${args.functionality}`, name: String(workflow.name), workflow };
}

/** Deployt + aktiviert eine AI-Webhook-Funktionalität sofort (kein Postfach/OAuth nötig). */
export async function deployAiTool(
  supabase: SupabaseClient,
  args: DeployAiToolArgs,
): Promise<{ ok: boolean; n8nId: string; webhookUrl: string; label: string; error?: string }> {
  const { createN8nWorkflow, saveN8nWorkflowDefinition, activateN8nWorkflow } = await import('@/lib/n8n');
  const built = buildAiTool(args);
  const label = AI_TOOL_FUNCTIONS[args.functionality].label;

  const { data: existing } = await supabase
    .from('workflows')
    .select('n8n_workflow_id')
    .eq('project_id', args.projectId)
    .eq('name', built.name)
    .maybeSingle();

  let n8nId: string;
  if (existing?.n8n_workflow_id) {
    n8nId = existing.n8n_workflow_id as string;
    await saveN8nWorkflowDefinition(n8nId, built.workflow as object);
  } else {
    const created = await createN8nWorkflow(built.workflow as object);
    n8nId = created.id;
    const { error: insErr } = await supabase.from('workflows').insert({
      user_id: args.userId,
      project_id: args.projectId,
      name: built.name,
      n8n_workflow_id: n8nId,
      status: 'active',
    });
    if (insErr) return { ok: false, n8nId, webhookUrl: '', label, error: `DB-Eintrag fehlgeschlagen: ${insErr.message}` };
  }
  await activateN8nWorkflow(n8nId).catch(() => undefined);

  const webhookUrl = `${n8nWebhookBase()}/webhook/${args.functionality.replace(/_/g, '-')}-${projectSuffix(args.projectId)}`;
  return { ok: true, n8nId, webhookUrl, label };
}

export interface DeployChatbotArgs {
  userId: string;
  projectId: string;
  personaPath?: string;
  appBaseUrl: string;
}

/** Baut den FAQ-Chatbot mit gefüllten Slots + gebundener Header-Auth-Credential. */
export function buildFaqChatbot(args: DeployChatbotArgs): BuiltWorkflow {
  const { workspaceToken } = centralCredIds();
  const { workflow } = loadWorkflowTemplate('faq-chatbot', {
    scalars: {
      FAQ_WEBHOOK_PATH: `faq-${projectSuffix(args.projectId)}`,
      APP_BASE_URL: args.appBaseUrl,
      PROJECT_ID: args.projectId,
      PERSONA_PATH: args.personaPath || 'rules/persona_default.md',
    },
  });
  bindCredentials(workflow, { workspaceToken, twilio: '', mailCredId: null, mailProvider: 'gmail', calendarCredId: null });
  return { slug: 'faq-chatbot', name: String(workflow.name ?? 'faq-chatbot'), workflow };
}

/**
 * Deployt den FAQ-Chatbot und AKTIVIERT ihn sofort — ein Webhook-Workflow braucht kein
 * verbundenes Postfach / kein OAuth. Gibt die öffentliche Webhook-URL zurück.
 */
export async function deployFaqChatbot(
  supabase: SupabaseClient,
  args: DeployChatbotArgs,
): Promise<{ ok: boolean; n8nId: string; webhookUrl: string; error?: string }> {
  const { createN8nWorkflow, saveN8nWorkflowDefinition, activateN8nWorkflow } = await import('@/lib/n8n');
  const built = buildFaqChatbot(args);

  const { data: existing } = await supabase
    .from('workflows')
    .select('n8n_workflow_id')
    .eq('project_id', args.projectId)
    .eq('name', built.name)
    .maybeSingle();

  let n8nId: string;
  if (existing?.n8n_workflow_id) {
    n8nId = existing.n8n_workflow_id as string;
    await saveN8nWorkflowDefinition(n8nId, built.workflow as object);
  } else {
    const created = await createN8nWorkflow(built.workflow as object);
    n8nId = created.id;
    const { error: insErr } = await supabase.from('workflows').insert({
      user_id: args.userId,
      project_id: args.projectId,
      name: built.name,
      n8n_workflow_id: n8nId,
      status: 'active',
    });
    if (insErr) return { ok: false, n8nId, webhookUrl: '', error: `DB-Eintrag fehlgeschlagen: ${insErr.message}` };
  }
  await activateN8nWorkflow(n8nId).catch(() => undefined);

  const webhookUrl = `${n8nWebhookBase()}/webhook/faq-${projectSuffix(args.projectId)}`;
  return { ok: true, n8nId, webhookUrl };
}
