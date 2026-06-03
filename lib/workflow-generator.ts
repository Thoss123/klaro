/**
 * Converts a Klaro Phase-3 Workflow into a deployable n8n workflow JSON.
 * The model decides which tool handles each step in Phase 4 chat.
 * This generator takes the step-level tool decisions and builds valid n8n JSON.
 */

import { Workflow, WorkflowStep } from './types';

// Maps tool name → n8n credential type key (null = no credential needed)
export const CREDENTIAL_TYPE: Record<string, string | null> = {
  gmail:       'gmailOAuth2Api',
  google_docs: 'googleDocsOAuth2Api',
  google_sheets: 'googleSheetsOAuth2Api',
  slack:       'slackApi',
  notion:      'notionApi',
  hubspot:     'hubspotApi',
  airtable:    'airtableTokenApi',
  openai:      'openAiApi',
  gemini:      'httpHeaderAuth', // call Gemini via HTTP with API key
  mistral:     'httpHeaderAuth',
  webhook:     null, // no credential needed
  schedule:    null,
  http:        null,
};

// Maps tool name → n8n node type
export const NODE_TYPE: Record<string, { type: string; version: number }> = {
  gmail:          { type: 'n8n-nodes-base.gmail',           version: 2 },
  google_docs:    { type: 'n8n-nodes-base.googleDocs',      version: 2 },
  google_sheets:  { type: 'n8n-nodes-base.googleSheets',    version: 4 },
  slack:          { type: 'n8n-nodes-base.slack',           version: 2 },
  notion:         { type: 'n8n-nodes-base.notion',          version: 2 },
  hubspot:        { type: 'n8n-nodes-base.hubspot',         version: 2 },
  airtable:       { type: 'n8n-nodes-base.airtable',        version: 2 },
  openai:         { type: '@n8n/n8n-nodes-langchain.openAi', version: 1 },
  gemini:         { type: 'n8n-nodes-base.httpRequest',     version: 4 },
  mistral:        { type: 'n8n-nodes-base.httpRequest',     version: 4 },
  webhook:        { type: 'n8n-nodes-base.webhook',         version: 2 },
  schedule:       { type: 'n8n-nodes-base.scheduleTrigger', version: 1 },
  http:           { type: 'n8n-nodes-base.httpRequest',     version: 4 },
  decision:       { type: 'n8n-nodes-base.if',              version: 2 },
  set:            { type: 'n8n-nodes-base.set',             version: 3 },
  manual:         { type: 'n8n-nodes-base.manualTrigger',   version: 1 },
};

export interface StepMapping {
  step_id: string;
  tool: string;           // from NODE_TYPE map
  credential_id?: string; // n8n credential id (after creation)
  parameters?: Record<string, any>;
}

/** All Klaro-deployed n8n workflows are namespaced with this prefix so they are
 *  instantly identifiable in the shared n8n instance. */
export const KLARO_WORKFLOW_PREFIX = 'KLARO: ';

/** Ensure a workflow name carries the KLARO: prefix exactly once. */
export function withKlaroPrefix(name: string): string {
  const clean = (name || '').trim();
  if (clean.toUpperCase().startsWith('KLARO:')) {
    // Normalize spacing after the colon.
    return KLARO_WORKFLOW_PREFIX + clean.replace(/^klaro:\s*/i, '');
  }
  return KLARO_WORKFLOW_PREFIX + (clean || 'Workflow');
}

/**
 * Build a valid n8n workflow JSON from a Phase-3 Workflow + step mappings.
 * Positions nodes horizontally with 200px spacing.
 */
export function buildN8nWorkflow(
  workflow: Workflow,
  mappings: StepMapping[],
  workflowName: string,
): object {
  const nodes: any[] = [];
  const connections: Record<string, any> = {};

  workflow.steps.forEach((step, i) => {
    const mapping = mappings.find(m => m.step_id === step.id);
    const toolKey = mapping?.tool || (step.type === 'decision' ? 'decision' : 'set');
    const nodeDef = NODE_TYPE[toolKey] || NODE_TYPE.set;

    const nodeName = sanitizeName(step.label, i);
    const x = 200 + i * 250;
    const y = 300;

    const credentialKey = CREDENTIAL_TYPE[toolKey];
    const credentials: Record<string, any> = {};
    if (credentialKey && mapping?.credential_id) {
      credentials[credentialKey] = {
        id: mapping.credential_id,
        name: `${toolKey}-credential`,
      };
    }

    nodes.push({
      id: step.id,
      name: nodeName,
      type: nodeDef.type,
      typeVersion: nodeDef.version,
      position: [x, y],
      parameters: mapping?.parameters || getDefaultParameters(toolKey, step),
      ...(Object.keys(credentials).length ? { credentials } : {}),
    });

    // Wire connection from previous node
    if (i > 0) {
      const prevName = sanitizeName(workflow.steps[i - 1].label, i - 1);
      if (!connections[prevName]) connections[prevName] = { main: [[]] };
      if (!connections[prevName].main[0]) connections[prevName].main[0] = [];
      connections[prevName].main[0].push({ node: nodeName, type: 'main', index: 0 });
    }
  });

  return {
    // n8n workflows are namespaced so they're identifiable in the shared instance.
    name: withKlaroPrefix(workflowName),
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
    active: false,
  };
}

function sanitizeName(label: string, index: number): string {
  return label.replace(/[^a-zA-Z0-9äöüÄÖÜß\s\-_]/g, '').trim() || `Step ${index + 1}`;
}

function getDefaultParameters(tool: string, step: WorkflowStep): Record<string, any> {
  switch (tool) {
    case 'webhook':
      return { httpMethod: 'POST', path: `klaro-${step.id}`, responseMode: 'onReceived' };
    case 'schedule':
      return { rule: { interval: [{ field: 'hours', minutesInterval: 24 }] } };
    case 'decision':
      return { conditions: { string: [{ value1: '={{ $json.status }}', operation: 'isNotEmpty' }] } };
    case 'gemini':
    case 'mistral':
      return {
        method: 'POST',
        url: tool === 'gemini'
          ? 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
          : 'https://api.mistral.ai/v1/chat/completions',
        sendBody: true,
        bodyParameters: { parameters: [{ name: 'contents', value: '={{ $json }}' }] },
      };
    default:
      return {};
  }
}

/** Return list of unique tools that need credentials */
export function getRequiredCredentials(mappings: StepMapping[]): string[] {
  const tools = new Set<string>();
  for (const m of mappings) {
    if (CREDENTIAL_TYPE[m.tool] !== null && CREDENTIAL_TYPE[m.tool] !== undefined) {
      tools.add(m.tool);
    }
  }
  return Array.from(tools);
}
