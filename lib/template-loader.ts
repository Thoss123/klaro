import fs from 'fs';
import path from 'path';

/**
 * Template-Loader: füllt die Slots einer geprüften „golden" n8n-Workflow-JSON.
 *
 * Prinzip (siehe knowledge/templates/README.md): ein Workflow wird EINMAL in n8n gebaut,
 * getestet und als `knowledge/templates/workflows/<slug>.json` eingefroren. Statt die JSON
 * je Nutzer neu zu generieren, werden nur klar definierte Slots getauscht:
 *  - Struktur-Slots (Node-Typ):  {{TRIGGER_NODE}}, {{SEND_NODE}}, {{CRM_NODE}}
 *      → per Provider/CRM-Wahl auf echten n8n-Typ + typeVersion aufgelöst
 *  - Skalar-Slots (String):      {{KATEGORIEN}}, {{ABSENDER_NAME}}, {{FREIGABE_KANAL}}, …
 *      → per String-Ersetzung in allen Parameter-Werten gefüllt
 *
 * Bleibt ein `{{…}}` übrig, wirft der Loader — so wird nie eine halb-gefüllte Vorlage deployt.
 */

export const WORKFLOW_TEMPLATE_DIR = path.join(process.cwd(), 'knowledge', 'templates', 'workflows');

export type MailProvider = 'gmail' | 'outlook' | 'imap';
export type CrmProvider = 'hubspot' | 'pipedrive' | 'salesforce' | 'zoho';

interface NodeSpec {
  type: string;
  typeVersion: number;
  /** n8n-Credential-Typ-Schlüssel, den der Deploy-Schritt injiziert (null = keine Credential). */
  credentialType: string | null;
}

/**
 * Mail-Provider-Swap: Trigger- und Send-Node je Anbieter. Die Credential-Schlüssel müssen mit
 * CREDENTIAL_TYPE in lib/workflow-generator.ts konsistent bleiben (dort für den Coach-Pfad).
 */
export const MAIL_PROVIDER_NODES: Record<MailProvider, { trigger: NodeSpec; send: NodeSpec }> = {
  gmail: {
    trigger: { type: 'n8n-nodes-base.gmailTrigger', typeVersion: 1, credentialType: 'gmailOAuth2Api' },
    send: { type: 'n8n-nodes-base.gmail', typeVersion: 2, credentialType: 'gmailOAuth2Api' },
  },
  outlook: {
    trigger: { type: 'n8n-nodes-base.microsoftOutlookTrigger', typeVersion: 1, credentialType: 'microsoftOutlookOAuth2Api' },
    send: { type: 'n8n-nodes-base.microsoftOutlook', typeVersion: 2, credentialType: 'microsoftOutlookOAuth2Api' },
  },
  imap: {
    trigger: { type: 'n8n-nodes-base.emailReadImap', typeVersion: 2, credentialType: 'imap' },
    send: { type: 'n8n-nodes-base.emailSend', typeVersion: 2, credentialType: 'smtp' },
  },
};

/** CRM-Swap für den Kontext-Lookup-Node ({{CRM_NODE}}). */
export const CRM_PROVIDER_NODES: Record<CrmProvider, NodeSpec> = {
  hubspot: { type: 'n8n-nodes-base.hubspot', typeVersion: 2, credentialType: 'hubspotApi' },
  pipedrive: { type: 'n8n-nodes-base.pipedrive', typeVersion: 1, credentialType: 'pipedriveApi' },
  salesforce: { type: 'n8n-nodes-base.salesforce', typeVersion: 1, credentialType: 'salesforceOAuth2Api' },
  zoho: { type: 'n8n-nodes-base.zohoCrm', typeVersion: 1, credentialType: 'zohoOAuth2Api' },
};

export const TRIGGER_SLOT = '{{TRIGGER_NODE}}';
export const SEND_SLOT = '{{SEND_NODE}}';
export const CRM_SLOT = '{{CRM_NODE}}';

export interface SlotValues {
  mailProvider?: MailProvider;
  crmProvider?: CrmProvider;
  /** Skalare Platzhalter ohne Klammern, z.B. { KATEGORIEN: 'Spam, Lead, …' }. */
  scalars?: Record<string, string>;
}

export interface N8nNode {
  name: string;
  type: string;
  typeVersion?: number;
  parameters?: Record<string, unknown>;
  [k: string]: unknown;
}
export interface N8nWorkflowJson {
  name?: string;
  nodes: N8nNode[];
  connections?: Record<string, unknown>;
  [k: string]: unknown;
}

/** Ein Node, dessen Credential der Deploy-Schritt noch injizieren muss. */
export interface CredentialBinding {
  node: string;
  credentialType: string;
}

export interface LoadedTemplate {
  workflow: N8nWorkflowJson;
  /** Provider/CRM-Nodes, für die eine Credential (zentral oder pro User) gebunden werden muss. */
  credentialBindings: CredentialBinding[];
}

/** Rekursiv alle String-Werte durchgehen und Skalar-Slots ersetzen. */
function replaceScalars(value: unknown, scalars: Record<string, string>): unknown {
  if (typeof value === 'string') {
    return value.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (match, key: string) =>
      key in scalars ? scalars[key] : match,
    );
  }
  if (Array.isArray(value)) return value.map((v) => replaceScalars(v, scalars));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = replaceScalars(v, scalars);
    return out;
  }
  return value;
}

/** Alle verbliebenen `{{…}}`-Platzhalter im JSON einsammeln (für die Fehlermeldung). */
function findLeftoverSlots(obj: unknown, acc: Set<string>): void {
  if (typeof obj === 'string') {
    for (const m of obj.matchAll(/\{\{\s*[A-Z0-9_]+\s*\}\}/g)) acc.add(m[0]);
  } else if (Array.isArray(obj)) {
    for (const v of obj) findLeftoverSlots(v, acc);
  } else if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) findLeftoverSlots(v, acc);
  }
}

/**
 * Füllt die Slots einer golden n8n-JSON. Wirft, wenn nach dem Ersetzen noch ein `{{…}}` übrig ist
 * (z.B. Struktur-Slot ohne gewählten Provider oder fehlender Skalar).
 */
export function applySlots(template: N8nWorkflowJson, slots: SlotValues): LoadedTemplate {
  const workflow = JSON.parse(JSON.stringify(template)) as N8nWorkflowJson;
  const credentialBindings: CredentialBinding[] = [];

  const bindNode = (node: N8nNode, spec: NodeSpec) => {
    node.type = spec.type;
    node.typeVersion = spec.typeVersion;
    if (spec.credentialType) credentialBindings.push({ node: node.name, credentialType: spec.credentialType });
  };

  for (const node of workflow.nodes ?? []) {
    if (node.type === TRIGGER_SLOT && slots.mailProvider) {
      bindNode(node, MAIL_PROVIDER_NODES[slots.mailProvider].trigger);
    } else if (node.type === SEND_SLOT && slots.mailProvider) {
      bindNode(node, MAIL_PROVIDER_NODES[slots.mailProvider].send);
    } else if (node.type === CRM_SLOT && slots.crmProvider) {
      bindNode(node, CRM_PROVIDER_NODES[slots.crmProvider]);
    }
  }

  const filled = replaceScalars(workflow, slots.scalars ?? {}) as N8nWorkflowJson;

  const leftover = new Set<string>();
  findLeftoverSlots(filled, leftover);
  if (leftover.size > 0) {
    throw new Error(`Ungefüllte Template-Slots: ${[...leftover].join(', ')}`);
  }

  return { workflow: filled, credentialBindings };
}

/** Golden JSON eines Templates von Disk laden und Slots füllen. */
export function loadWorkflowTemplate(slug: string, slots: SlotValues): LoadedTemplate {
  const file = path.join(WORKFLOW_TEMPLATE_DIR, `${slug}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Workflow-Template nicht gefunden: ${slug}.json`);
  }
  const template = JSON.parse(fs.readFileSync(file, 'utf-8')) as N8nWorkflowJson;
  return applySlots(template, slots);
}
