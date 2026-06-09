/**
 * Converts a Klaro Phase-3 Workflow into a deployable n8n workflow JSON.
 * The model decides which tool handles each step in Phase 4 chat.
 * This generator takes the step-level tool decisions and builds valid n8n JSON.
 */

import { Workflow, WorkflowStep, StepConfigType } from './types';
import { branchOutputIndex, edgeTargetInput, resolveWorkflowEdges } from './workflow-graph';
import type { WorkflowEdge } from './types';

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
  tool?: string;           // legacy Klaro tool key
  n8n_type?: string;       // n8n node type, e.g. n8n-nodes-base.gmail
  type_version?: number;
  credential_id?: string;
  credential_type?: string;
  parameters?: Record<string, unknown>;
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

function randId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Stellt sicher, dass kritische Node-Typen GÜLTIGE Parameter haben (sonst Runtime-Fehler
 * wie „compareOperationFunctions[compareData.operation] is not a function" beim IF-Node).
 * n8n IF/Filter v2 braucht conditions[].operator.{type,operation}.
 */
export function ensureNodeParams(
  nodeType: string,
  parameters: Record<string, unknown>,
): Record<string, unknown> {
  const p = { ...parameters };

  if (nodeType === 'n8n-nodes-base.if' || nodeType === 'n8n-nodes-base.filter') {
    const c = p.conditions as any;
    const valid = c && Array.isArray(c.conditions) && c.conditions.length > 0
      && c.conditions.every((cond: any) => cond?.operator?.type && cond?.operator?.operation);
    if (!valid) {
      p.conditions = {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{
          id: randId(),
          leftValue: '={{ $json }}',
          rightValue: '',
          operator: { type: 'string', operation: 'exists', singleValue: true },
        }],
        combinator: 'and',
      };
    }
  }

  if (nodeType === 'n8n-nodes-base.switch') {
    const rules = p.rules as any;
    const hasValues = rules && Array.isArray(rules.values) && rules.values.length > 0;
    if (!hasValues) {
      p.mode = p.mode ?? 'rules';
      p.rules = {
        values: [{
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
            conditions: [{ id: randId(), leftValue: '={{ $json }}', rightValue: '', operator: { type: 'string', operation: 'exists', singleValue: true } }],
            combinator: 'and',
          },
          outputKey: '0',
        }],
      };
      p.options = p.options ?? { fallbackOutput: 'none' };
    }
  }

  return p;
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
  const edges = resolveWorkflowEdges(workflow.steps, workflow.edges);

  workflow.steps.forEach((step, i) => {
    const mapping = mappings.find(m => m.step_id === step.id);

    let nodeType: string;
    let typeVersion: number;
    let parameters: Record<string, unknown>;

    if (mapping?.n8n_type || step.n8nType) {
      nodeType = mapping?.n8n_type || step.n8nType!;
      typeVersion = mapping?.type_version ?? step.n8nTypeVersion ?? 1;
      parameters = mapping?.parameters || step.parameters || getDefaultParameters('', step);
    } else {
      const toolKey = mapping?.tool || (step.type === 'decision' ? 'decision' : 'set');
      const nodeDef = NODE_TYPE[toolKey] || NODE_TYPE.set;
      nodeType = nodeDef.type;
      typeVersion = nodeDef.version;
      parameters = mapping?.parameters || getDefaultParameters(toolKey, step);
    }

    // Kritische Node-Parameter absichern (IF/Switch/Filter brauchen gültige Operatoren).
    parameters = ensureNodeParams(nodeType, parameters || {});

    const nodeName = sanitizeName(step.label, i);
    const x = 200 + i * 250;
    const y = 300;

    const credentialKey = mapping?.credential_type
      || (mapping?.tool ? CREDENTIAL_TYPE[mapping.tool] : undefined)
      || step.credentialType
      || undefined;
    const credentials: Record<string, unknown> = {};
    if (credentialKey && mapping?.credential_id) {
      credentials[credentialKey] = {
        id: mapping.credential_id,
        name: `${credentialKey}-credential`,
      };
      // Viele n8n-Nodes (wie Airtable) erwarten zusätzlich, dass der Parameter "authentication"
      // auf den Namen des Credential-Typs gesetzt ist (sonst steht dort oft "none" und es knallt).
      if (parameters.authentication === 'none' || !parameters.authentication) {
        parameters.authentication = credentialKey;
      }
    } else {
      // Falls kein Credential existiert, aber "authentication" gesetzt ist, n8n verwirren wir
      // nicht mit "none", was er als Credential-Typ sucht.
      if (parameters.authentication === 'none') delete parameters.authentication;
    }

    nodes.push({
      id: step.id,
      name: nodeName,
      type: nodeType,
      typeVersion,
      position: [step.position?.x ?? x, step.position?.y ?? y],
      parameters,
      ...(Object.keys(credentials).length ? { credentials } : {}),
    });
  });

  for (const edge of edges) {
    const sourceStep = workflow.steps.find(s => s.id === edge.source);
    const targetStep = workflow.steps.find(s => s.id === edge.target);
    if (!sourceStep || !targetStep) continue;
    const sourceIdx = workflow.steps.indexOf(sourceStep);
    const targetStepIdx = workflow.steps.indexOf(targetStep);
    const sourceName = sanitizeName(sourceStep.label, sourceIdx);
    const targetName = sanitizeName(targetStep.label, targetStepIdx);

    // LangChain-Sub-Connections (Chat Model/Memory/Tool → Agent)
    if (edge.connectionType) {
      const connType = edge.connectionType;
      if (!connections[sourceName]) connections[sourceName] = {};
      if (!connections[sourceName][connType]) connections[sourceName][connType] = [[]];
      const slotEdges = connections[sourceName][connType][0] ?? [];
      const toolIdx = slotEdges.length;
      connections[sourceName][connType][0] = [
        ...slotEdges,
        { node: targetName, type: connType, index: toolIdx },
      ];
      continue;
    }

    const outIdx = branchOutputIndex(edge.branch, sourceStep);
    const mergeInputIdx = edgeTargetInput(edge);
    if (!connections[sourceName]) connections[sourceName] = { main: [[]] };
    while (connections[sourceName].main.length <= outIdx) {
      connections[sourceName].main.push([]);
    }
    if (!connections[sourceName].main[outIdx]) connections[sourceName].main[outIdx] = [];
    connections[sourceName].main[outIdx].push({
      node: targetName,
      type: 'main',
      index: mergeInputIdx,
    });
  }

  // Fallback: linear chain if no edges defined
  if (!edges.length) {
    workflow.steps.forEach((step, i) => {
      if (i === 0) return;
      const prevName = sanitizeName(workflow.steps[i - 1].label, i - 1);
      const nodeName = sanitizeName(step.label, i);
      if (!connections[prevName]) connections[prevName] = { main: [[]] };
      if (!connections[prevName].main[0]) connections[prevName].main[0] = [];
      connections[prevName].main[0].push({ node: nodeName, type: 'main', index: 0 });
    });
  }

  return {
    // n8n workflows are namespaced so they're identifiable in the shared instance.
    name: withKlaroPrefix(workflowName),
    nodes,
    connections,
    // WICHTIG: n8n REST POST /workflows lehnt `active` als read-only ab (400) → weglassen,
    // Aktivierung nur über /activate. `availableInMCP: true` MUSS bleiben — sonst „Workflow is
    // not available in MCP" beim Testlauf (MCP-Trigger braucht den Flag).
    settings: { executionOrder: 'v1', availableInMCP: true },
  };
}

/** n8n-Node-Name aus Schritt-Label (muss mit buildN8nWorkflow übereinstimmen). */
export function n8nNodeNameForStep(label: string, index: number): string {
  return label.replace(/[^a-zA-Z0-9äöüÄÖÜß\s\-_]/g, '').trim() || `Step ${index + 1}`;
}

function sanitizeName(label: string, index: number): string {
  return n8nNodeNameForStep(label, index);
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

/**
 * Phase 4: decide which configuration panel a step needs in the WorkflowDeployCard.
 * Single source of truth shared by WorkflowDeployCard and StepConfigModal.
 */
export function resolveStepConfigType(step: WorkflowStep): StepConfigType {
  if (step.type === 'human') return 'human';
  if (step.type === 'ai') return 'ai';
  const tool = step.tool?.toLowerCase() ?? '';
  if (['openai', 'gemini', 'mistral'].includes(tool)) return 'ai';
  if (step.type === 'trigger' && tool === 'schedule') return 'schedule';
  if (step.type === 'trigger') return 'webhook';
  if (CREDENTIAL_TYPE[tool] != null) return 'credential';
  return 'credential';
}

/** Return list of unique tools that need credentials */
export function getRequiredCredentials(mappings: StepMapping[]): string[] {
  const tools = new Set<string>();
  for (const m of mappings) {
    const key = m.tool || m.credential_type;
    if (key && CREDENTIAL_TYPE[key] !== null && CREDENTIAL_TYPE[key] !== undefined) {
      tools.add(key);
    }
    if (m.credential_type) tools.add(m.credential_type);
  }
  return Array.from(tools);
}
