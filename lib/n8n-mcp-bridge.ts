/**
 * n8n instance-level MCP client (Streamable HTTP / JSON-RPC).
 * Docs: https://docs.n8n.io/advanced-ai/mcp/accessing-n8n-mcp-server/
 * Tools: https://docs.n8n.io/advanced-ai/mcp/mcp_tools_reference/
 *
 * Server-only — uses N8N_MCP_URL + N8N_MCP_TOKEN (not N8N_API_KEY).
 */

const MCP_URL = () => process.env.N8N_MCP_URL?.trim() || '';
const MCP_TOKEN = () => process.env.N8N_MCP_TOKEN?.trim() || '';
const MOCK = () => process.env.MOCK_N8N === 'true';

export function isN8nMcpConfigured(): boolean {
  return !MOCK() && !!MCP_URL() && !!MCP_TOKEN();
}

// ── JSON-RPC types ────────────────────────────────────────────────────────────

interface McpToolResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

interface JsonRpcEnvelope {
  jsonrpc?: string;
  id?: number;
  result?: McpToolResult;
  error?: { code?: number; message?: string; data?: unknown };
}

// ── Low-level transport ───────────────────────────────────────────────────────

let rpcId = 0;

function parseSseBody(raw: string): JsonRpcEnvelope {
  const dataLines = raw
    .split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim());

  if (dataLines.length === 0) {
    throw new Error('n8n MCP: leere SSE-Antwort');
  }

  const last = dataLines[dataLines.length - 1];
  try {
    return JSON.parse(last) as JsonRpcEnvelope;
  } catch {
    throw new Error(`n8n MCP: ungültiges JSON in SSE (${last.slice(0, 120)}…)`);
  }
}

function unwrapToolResult<T>(envelope: JsonRpcEnvelope, toolName: string): T {
  if (envelope.error) {
    throw new Error(`n8n MCP ${toolName}: ${envelope.error.message || 'RPC-Fehler'}`);
  }

  const result = envelope.result;
  if (!result) {
    throw new Error(`n8n MCP ${toolName}: keine Antwort`);
  }

  if (result.isError) {
    const sc = result.structuredContent as { error?: string } | undefined;
    const text = result.content?.[0]?.text;
    let msg = sc?.error;
    if (!msg && text) {
      try {
        msg = (JSON.parse(text) as { error?: string }).error;
      } catch {
        msg = text;
      }
    }
    throw new Error(msg || `n8n MCP ${toolName} fehlgeschlagen`);
  }

  if (result.structuredContent !== undefined && result.structuredContent !== null) {
    return result.structuredContent as T;
  }

  const text = result.content?.[0]?.text;
  if (text) {
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  throw new Error(`n8n MCP ${toolName}: leerer Tool-Output`);
}

/** Call any n8n MCP tool by name. */
export async function n8nMcpCall<T = unknown>(
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (MOCK()) {
    throw new Error('n8n MCP nicht verfügbar (MOCK_N8N=true)');
  }

  const url = MCP_URL();
  const token = MCP_TOKEN();
  if (!url || !token) {
    throw new Error('n8n MCP nicht konfiguriert (N8N_MCP_URL / N8N_MCP_TOKEN fehlen)');
  }

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: ++rpcId,
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body,
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`n8n MCP HTTP ${res.status}: ${raw.slice(0, 300)}`);
  }

  return unwrapToolResult<T>(parseSseBody(raw), toolName);
}

/** List tool names exposed by the instance (health check). */
export async function n8nMcpListTools(): Promise<string[]> {
  if (MOCK()) return ['search_workflows', 'test_workflow'];

  const url = MCP_URL();
  const token = MCP_TOKEN();
  if (!url || !token) return [];

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: ++rpcId,
    method: 'tools/list',
    params: {},
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body,
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`n8n MCP HTTP ${res.status}`);
  }

  const envelope = parseSseBody(raw);
  const tools = (envelope.result as { tools?: Array<{ name: string }> } | undefined)?.tools;
  return tools?.map(t => t.name) ?? [];
}

// ── Typed helpers (Workflow management) ───────────────────────────────────────

export interface McpWorkflowPreview {
  id: string;
  name: string | null;
  description?: string | null;
  active?: boolean | null;
  availableInMCP?: boolean;
  canExecute?: boolean;
}

export interface McpSearchWorkflowsResult {
  data: McpWorkflowPreview[];
  count: number;
}

export async function mcpSearchWorkflows(
  query?: string,
  limit = 50,
): Promise<McpSearchWorkflowsResult> {
  return n8nMcpCall<McpSearchWorkflowsResult>('search_workflows', {
    ...(query ? { query } : {}),
    limit,
  });
}

export async function mcpGetWorkflowDetails(workflowId: string) {
  return n8nMcpCall<{ workflow: Record<string, unknown>; triggerInfo?: string }>(
    'get_workflow_details',
    { workflowId },
  );
}

export type McpExecutionStatus =
  | 'success'
  | 'error'
  | 'running'
  | 'waiting'
  | 'canceled'
  | 'crashed'
  | 'new'
  | 'unknown';

export interface McpTestWorkflowResult {
  executionId: string | null;
  status: McpExecutionStatus;
  error?: string;
}

export interface McpPrepareTestPinDataResult {
  nodeSchemasToGenerate: Record<string, unknown>;
  nodesWithoutSchema: string[];
  nodesSkipped: string[];
  coverage?: {
    withSchemaFromExecution: number;
    withSchemaFromDefinition: number;
    withoutSchema: number;
    skipped: number;
    total: number;
  };
}

export async function mcpPrepareTestPinData(
  workflowId: string,
): Promise<McpPrepareTestPinDataResult> {
  return n8nMcpCall<McpPrepareTestPinDataResult>('prepare_test_pin_data', { workflowId });
}

export async function mcpTestWorkflow(
  workflowId: string,
  pinData: Record<string, unknown>,
  triggerNodeName?: string,
): Promise<McpTestWorkflowResult> {
  return n8nMcpCall<McpTestWorkflowResult>('test_workflow', {
    workflowId,
    pinData,
    ...(triggerNodeName ? { triggerNodeName } : {}),
  });
}

// Kanonische Trigger-Erkennung (gleiche Regex wie n8n-mcp-search / workflow-sdk-codegen).
const TRIGGER_NODE_RE = /Trigger$|\.webhook$|\.mcpTrigger$|\.formTrigger$/;

/**
 * Pin-Daten NUR für Trigger-Nodes bauen — damit der Workflow startet, ohne dass
 * Action-/Credential-Nodes (Airtable, Gmail …) gepinnt werden. Gepinnte Nodes
 * werden von n8n NICHT ausgeführt, sondern geben nur die Pin-Daten zurück.
 *
 * Der frühere Ansatz pinnte ALLE von prepare_test_pin_data gemeldeten Nodes
 * (inkl. Credential-Nodes) mit leerem {json:{}} → der Airtable-Node lief nie echt
 * und der Testlauf zeigte `[{}]` statt echtem Output. Jetzt laufen alle
 * Nicht-Trigger-Nodes real und liefern echte Daten (wie der „Execute"-Button in n8n).
 */
export function buildTriggerPinData(
  nodes: Array<{ name?: string; type?: string }>,
): Record<string, unknown> {
  const pinData: Record<string, unknown> = {};
  for (const node of nodes) {
    if (node?.name && node?.type && TRIGGER_NODE_RE.test(node.type)) {
      pinData[node.name] = [{ json: {} }];
    }
  }
  return pinData;
}

/**
 * Echter Testlauf: nur Trigger pinnen, alle Action-Nodes real ausführen.
 * So liefert „Testen" in Klaro denselben echten Node-Output wie n8n selbst.
 */
export async function mcpRunWorkflowTest(workflowId: string): Promise<McpTestWorkflowResult> {
  let pinData: Record<string, unknown> = {};
  try {
    const details = await mcpGetWorkflowDetails(workflowId);
    const nodes = (details?.workflow?.nodes as Array<{ name?: string; type?: string }> | undefined) ?? [];
    pinData = buildTriggerPinData(nodes);
  } catch {
    // Ohne Node-Liste startet test_workflow beim ersten Trigger (ohne Pin).
  }
  return mcpTestWorkflow(workflowId, pinData);
}

export async function mcpPublishWorkflow(workflowId: string, versionId?: string) {
  return n8nMcpCall<{ success: boolean; workflowId: string; activeVersionId?: string | null; error?: string }>(
    'publish_workflow',
    { workflowId, ...(versionId ? { versionId } : {}) },
  );
}

export async function mcpUnpublishWorkflow(workflowId: string) {
  return n8nMcpCall<{ success: boolean; workflowId: string; error?: string }>(
    'unpublish_workflow',
    { workflowId },
  );
}

// ── Workflow builder (partial update) ─────────────────────────────────────────

export type McpWorkflowOperation =
  | { operation: 'updateNodeParameters'; nodeName: string; parameters: Record<string, unknown>; replace?: boolean }
  | { operation: 'setNodeParameter'; nodeName: string; path: string; value: unknown }
  | { operation: 'setWorkflowMetadata'; name?: string; description?: string }
  | { operation: 'addNode'; node: Record<string, unknown> }
  | { operation: 'removeNode'; nodeName: string }
  | { operation: 'renameNode'; oldName: string; newName: string }
  | { operation: 'addConnection'; source: string; target: string; sourceIndex?: number; targetIndex?: number; connectionType?: string }
  | { operation: 'removeConnection'; source: string; target: string; sourceIndex?: number; targetIndex?: number; connectionType?: string }
  | { operation: 'setNodeCredential'; nodeName: string; credentialKey: string; credentialId: string; credentialName: string }
  | { operation: 'setNodePosition'; nodeName: string; position: [number, number] }
  | { operation: 'setNodeDisabled'; nodeName: string; disabled: boolean };

export interface McpValidateWorkflowResult {
  valid: boolean;
  nodeCount?: number;
  warnings?: Array<{ code: string; message: string; nodeName?: string; parameterPath?: string }>;
  errors?: string[];
}

export async function mcpValidateWorkflow(code: string): Promise<McpValidateWorkflowResult> {
  return n8nMcpCall<McpValidateWorkflowResult>('validate_workflow', { code });
}

export async function mcpSearchNodes(queries: string[]): Promise<{ results: string }> {
  return n8nMcpCall<{ results: string }>('search_nodes', { queries });
}

export async function mcpGetNodeTypes(
  nodeIds: Array<string | { nodeId: string; version?: string; resource?: string; operation?: string; mode?: string }>,
): Promise<{ definitions: string }> {
  return n8nMcpCall<{ definitions: string }>('get_node_types', { nodeIds });
}

export async function mcpUpdateWorkflow(workflowId: string, operations: McpWorkflowOperation[]) {
  // n8n MCP `update_workflow` erwartet `type` als Discriminator, intern heißt das Feld `operation`.
  // Am Wire-Rand umbenennen, sonst: „Invalid discriminator value … path operations.N.type".
  const wireOps = operations.map(({ operation, ...rest }) => ({ type: operation, ...rest }));
  return n8nMcpCall<{
    workflowId: string;
    name: string;
    nodeCount: number;
    appliedOperations: number;
    validationWarnings?: Array<{ code: string; message: string; nodeName?: string }>;
    note?: string;
  }>('update_workflow', { workflowId, operations: wireOps });
}
