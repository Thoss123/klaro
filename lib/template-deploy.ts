import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadWorkflowTemplate,
  type MailProvider,
  type CrmProvider,
  type N8nWorkflowJson,
} from '@/lib/template-loader';
import { buildCentralCredMap } from '@/lib/central-credentials';
import { AXANTILO_AI_TOOL, ensureAxantiloLlmCredential } from '@/lib/axantilo-llm-credential';
import { mailToolName } from '@/lib/bernd/mail-provider';

/**
 * Generischer Deploy-Pfad für golden Workflow-Templates (verallgemeinert aus
 * lib/deploy-agent-workflow.ts, das den E-Mail-Automation-Spezialfall abdeckt).
 *
 * Ein neues Template braucht KEINEN neuen Deploy-Code mehr: Slug + Slots reichen, solange
 * es dem Konventionen-Set aus knowledge/templates/README.md folgt (Provider-Swap-Nodes,
 * App-HTTP-Nodes mit genericAuthType=httpHeaderAuth, optional Mail-Nodes für Credential-Bindung).
 *
 * axantilo_ai (lmChatOpenAi-Sub-Node am zentralen LLM-Proxy, siehe lib/axantilo-llm-credential.ts):
 * kein golden Template nutzt bisher einen echten Chat-Model-Sub-Node (alle KI-Schritte laufen
 * über HTTP-Request auf /api/agent/llm, siehe knowledge/templates/README.md). Ein Template kann
 * trotzdem `needsAxantiloAi: true` setzen und im golden JSON einen Node mit
 * `credentials: { [AXANTILO_AI_TOOL]: {...} }` als Platzhalter markieren — der wird dann hier
 * mit der echten, pro-Projekt provisionierten Credential-ID befüllt.
 */

/**
 * Mail-Provider → n8n-Credential-Key, wie er tatsächlich im `node.credentials`-Objekt steht
 * (nicht identisch mit `credentialType` aus MAIL_PROVIDER_NODES/CredentialBinding — das ist
 * der Bindungs-Schlüssel für den Loader, dieser hier der reale n8n-Credential-Name).
 * Muss konsistent mit MAIL_CRED_KEY in lib/deploy-agent-workflow.ts bleiben.
 */
const MAIL_CRED_KEY: Record<MailProvider, string> = {
  gmail: 'gmailOAuth2',
  outlook: 'microsoftOutlookOAuth2Api',
  imap: 'imap',
};

/**
 * credentialType-Schlüssel aus dem Loader (MAIL_PROVIDER_NODES), die einen Mail-Trigger-/
 * Send-Node markieren — imap hat zwei (Trigger: `imap`, Send: `smtp`), beide bekommen
 * dieselbe Mail-Credential-ID des Users.
 */
const MAIL_BINDING_CRED_TYPES: Record<MailProvider, string[]> = {
  gmail: ['gmailOAuth2'],
  outlook: ['microsoftOutlookOAuth2Api'],
  imap: ['imap', 'smtp'],
};

/**
 * Google-Service-Nodes → (user_credentials.tool_name, n8n-Credential-Key). Diese laufen über
 * den zentralen Google-3-Klick-OAuth (pro User verbundenes Konto), nicht über zentrale Creds —
 * daher hier per tool_name aus user_credentials binden (analog zu google_calendar in
 * lib/deploy-agent-workflow.ts). tool_name-Konvention: siehe lib/workflow-generator.ts CREDENTIAL_TYPE.
 */
const GOOGLE_SERVICE_BINDINGS: Record<string, { toolName: string; credKey: string }> = {
  'n8n-nodes-base.googleDocs': { toolName: 'google_docs', credKey: 'googleDocsOAuth2Api' },
  'n8n-nodes-base.googleDrive': { toolName: 'google_drive', credKey: 'googleDriveOAuth2Api' },
  'n8n-nodes-base.googleSheets': { toolName: 'google_sheets', credKey: 'googleSheetsOAuth2Api' },
  'n8n-nodes-base.googleCalendar': { toolName: 'google_calendar', credKey: 'googleCalendarOAuth2Api' },
};

/** Kurzer, stabiler Suffix pro Projekt für kollisionsfreie Webhook-Pfade/Credential-Namen. */
export function projectSuffix(projectId: string): string {
  return projectId.replace(/-/g, '').slice(0, 8);
}

/** Aktive n8n-Credential-ID eines Users für ein Tool nachschlagen (`user_credentials`). Auch
 *  vom Gate (`lib/bernd/gate.ts` via die Deploy-Route) genutzt, um den Verbindungsstatus zu
 *  ermitteln, ohne die Lookup-Logik zu duplizieren. */
export async function findCredentialByTool(
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

export interface DeployTemplateWorkflowArgs {
  /** Slug des golden Templates in knowledge/templates/workflows/<slug>.json. */
  slug: string;
  userId: string;
  projectId: string;
  appBaseUrl: string;
  /** Skalar-Slots (APP_BASE_URL/PROJECT_ID werden automatisch ergänzt, falls im Template genutzt). */
  scalars?: Record<string, string>;
  /** Nur setzen, wenn das Template einen Mail-Provider-Slot ({{TRIGGER_NODE}}/{{SEND_NODE}}) hat. */
  mailProvider?: MailProvider;
  /** Nur setzen, wenn das Template einen CRM-Slot ({{CRM_NODE}}) hat. */
  crmProvider?: CrmProvider;
  /** Optionaler Name-Override (Default: Workflow-Name aus der golden JSON). */
  name?: string;
  /** true, wenn das Template einen echten axantilo_ai-Chat-Model-Sub-Node hat (siehe oben). */
  needsAxantiloAi?: boolean;
}

export interface BuiltTemplateWorkflow {
  slug: string;
  name: string;
  workflow: N8nWorkflowJson;
}

/**
 * Baut ein Template mit gefüllten Slots + gebundenen Credentials (zentral + pro-User Mail +
 * Axantilo-LLM-Proxy, falls der Workflow einen `axantilo_ai`-Chat-Model-Sub-Node hat).
 */
export async function buildTemplateWorkflow(
  supabase: SupabaseClient,
  args: DeployTemplateWorkflowArgs,
): Promise<BuiltTemplateWorkflow> {
  const scalars: Record<string, string> = {
    APP_BASE_URL: args.appBaseUrl,
    PROJECT_ID: args.projectId,
    ...(args.scalars ?? {}),
  };

  const { workflow, credentialBindings } = loadWorkflowTemplate(args.slug, {
    mailProvider: args.mailProvider,
    crmProvider: args.crmProvider,
    scalars,
  });

  if (args.name) workflow.name = args.name;

  const centralCreds = buildCentralCredMap();
  const mailCredId = args.mailProvider
    ? await findCredentialByTool(supabase, args.projectId, mailToolName(args.mailProvider))
    : null;
  // credentialType-Werte aus dem Loader (MAIL_PROVIDER_NODES), die diesen Mail-Provider markieren.
  const mailBindingTypes = args.mailProvider ? MAIL_BINDING_CRED_TYPES[args.mailProvider] : [];
  // Realer n8n-Credential-Key, unter dem die ID im node.credentials-Objekt landet.
  const mailCredKey = args.mailProvider ? MAIL_CRED_KEY[args.mailProvider] : undefined;

  const axantiloAiCredId = args.needsAxantiloAi
    ? await ensureAxantiloLlmCredential(supabase, args.userId, args.projectId, args.appBaseUrl)
    : null;

  const byName = new Map(workflow.nodes.map((n) => [n.name, n]));
  for (const binding of credentialBindings) {
    const node = byName.get(binding.node);
    if (!node) continue;

    if (mailBindingTypes.includes(binding.credentialType) && mailCredKey) {
      if (!mailCredId) continue;
      node.credentials = {
        ...(node.credentials as Record<string, unknown> | undefined),
        [mailCredKey]: { id: mailCredId, name: mailCredKey },
      };
      continue;
    }

    const credId =
      binding.credentialType === AXANTILO_AI_TOOL
        ? axantiloAiCredId ?? undefined
        : centralCreds[binding.credentialType];
    if (!credId) continue;
    node.credentials = {
      ...(node.credentials as Record<string, unknown> | undefined),
      [binding.credentialType]: { id: credId, name: binding.credentialType },
    };
  }

  // Google-Service-Nodes (Docs/Drive/Sheets/Calendar) sind ebenfalls kein Struct-Slot —
  // die pro-User Google-Credential (3-Klick-OAuth) hier per tool_name binden. Nur binden,
  // wenn der User den Dienst schon verbunden hat; sonst bleibt der Node uncredentialed und
  // die Aktivierung wartet (analog zum Mail-Gate).
  const googleCredCache = new Map<string, string | null>();
  for (const node of workflow.nodes) {
    const g = GOOGLE_SERVICE_BINDINGS[node.type];
    if (!g) continue;
    if (!googleCredCache.has(g.toolName)) {
      googleCredCache.set(g.toolName, await findCredentialByTool(supabase, args.projectId, g.toolName));
    }
    const credId = googleCredCache.get(g.toolName);
    if (!credId) continue;
    node.credentials = {
      ...(node.credentials as Record<string, unknown> | undefined),
      [g.credKey]: { id: credId, name: g.credKey },
    };
  }

  // App-HTTP-Nodes (genericAuthType=httpHeaderAuth) sind über den Loader NICHT als
  // credentialBindings erfasst (das ist ein Konventions-Match auf Node-Parameter, kein
  // Struct-Slot) — hier zusätzlich zentral binden, analog zu bindCredentials() in
  // lib/deploy-agent-workflow.ts.
  const workspaceToken = centralCreds.httpHeaderAuth;
  if (workspaceToken) {
    for (const node of workflow.nodes) {
      if (node.type !== 'n8n-nodes-base.httpRequest') continue;
      const p = node.parameters as { genericAuthType?: string } | undefined;
      if (p?.genericAuthType !== 'httpHeaderAuth') continue;
      node.credentials = {
        ...(node.credentials as Record<string, unknown> | undefined),
        httpHeaderAuth: { id: workspaceToken, name: 'httpHeaderAuth' },
      };
    }
  }

  return { slug: args.slug, name: String(workflow.name ?? args.slug), workflow };
}

export interface DeployTemplateResult {
  ok: boolean;
  n8nId: string;
  name: string;
  active: boolean;
  error?: string;
}

/**
 * Baut + deployt ein golden Template in die geteilte n8n-Instanz. Idempotent pro
 * (project_id, name) über die `workflows`-Tabelle — ein zweiter Aufruf für dasselbe Projekt
 * aktualisiert den bestehenden Workflow statt einen Duplikat anzulegen.
 *
 * Aktivierung: Templates ohne Mail-Provider-Slot (Webhook-only) werden sofort aktiviert;
 * hat das Template einen Mail-Provider-Slot, wird erst aktiviert, wenn das Postfach verbunden
 * ist (sonst lehnt n8n das Publishen wegen fehlender Pflicht-Credential ab).
 */
export async function deployTemplateWorkflow(
  supabase: SupabaseClient,
  args: DeployTemplateWorkflowArgs,
): Promise<DeployTemplateResult> {
  const { createN8nWorkflow, saveN8nWorkflowDefinition, activateN8nWorkflow } = await import('@/lib/n8n');
  const built = await buildTemplateWorkflow(supabase, args);

  const mailConnected = args.mailProvider
    ? Boolean(await findCredentialByTool(supabase, args.projectId, mailToolName(args.mailProvider)))
    : true; // kein Mail-Slot → kein Mailbox-Gate, sofort aktivierbar

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
      status: mailConnected ? 'active' : 'inactive',
    });
    if (insErr) {
      console.error('[template-deploy] workflows insert failed:', insErr.message);
      return { ok: false, n8nId, name: built.name, active: false, error: `DB-Eintrag fehlgeschlagen: ${insErr.message}` };
    }
  }

  if (mailConnected) await activateN8nWorkflow(n8nId).catch(() => undefined);
  return { ok: true, n8nId, name: built.name, active: mailConnected };
}
