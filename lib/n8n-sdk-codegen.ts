/**
 * Konvertiert Axantilo/n8n-Workflow-JSON in n8n Workflow-SDK-Code für validate_workflow (MCP).
 */

const TRIGGER_TYPES = new Set([
  'n8n-nodes-base.manualTrigger',
  'n8n-nodes-base.webhook',
  'n8n-nodes-base.scheduleTrigger',
  'n8n-nodes-base.formTrigger',
  '@n8n/n8n-nodes-langchain.chatTrigger',
]);

export interface N8nJsonNode {
  name: string;
  type: string;
  typeVersion: number;
  parameters?: Record<string, unknown>;
}

export interface N8nJsonWorkflow {
  name: string;
  nodes: N8nJsonNode[];
  connections?: Record<string, unknown>;
}

function escString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function serializeParams(params: Record<string, unknown> | undefined): string {
  if (!params || !Object.keys(params).length) return '{}';
  return JSON.stringify(params);
}

function isTrigger(type: string): boolean {
  return TRIGGER_TYPES.has(type) || type.toLowerCase().includes('trigger');
}

/** Baut eine lineare .to()-Kette entlang main-Connections (für SDK-Validate). */
function mainChainOrder(
  nodes: N8nJsonNode[],
  connections: Record<string, unknown>,
): N8nJsonNode[] {
  if (!nodes.length) return [];
  const byName = new Map(nodes.map(n => [n.name, n]));
  const incoming = new Set<string>();

  for (const [, conn] of Object.entries(connections)) {
    const main = (conn as { main?: Array<Array<{ node: string }>> })?.main;
    if (!main) continue;
    for (const branch of main) {
      for (const edge of branch ?? []) {
        if (edge?.node) incoming.add(edge.node);
      }
    }
  }

  const start = nodes.find(n => !incoming.has(n.name)) ?? nodes[0];
  const ordered: N8nJsonNode[] = [];
  const seen = new Set<string>();
  let current: N8nJsonNode | undefined = start;

  while (current && !seen.has(current.name)) {
    ordered.push(current);
    seen.add(current.name);
    const conn = connections[current.name] as { main?: Array<Array<{ node: string }>> } | undefined;
    const nextName = conn?.main?.[0]?.[0]?.node;
    current = nextName ? byName.get(nextName) : undefined;
  }

  for (const n of nodes) {
    if (!seen.has(n.name)) ordered.push(n);
  }
  return ordered;
}

/** Erzeugt SDK-Quellcode für MCP validate_workflow. */
export function workflowJsonToSdkCode(workflow: N8nJsonWorkflow): string {
  const wfId = 'axantilo-validate';
  const wfName = escString(workflow.name || 'AXANTILO: Workflow');
  const ordered = mainChainOrder(workflow.nodes, workflow.connections ?? {});

  const varNames = ordered.map((_, i) => `n${i}`);
  const decls = ordered.map((node, i) => {
    const factory = isTrigger(node.type) ? 'trigger' : 'node';
    const params = serializeParams(node.parameters);
    return `const ${varNames[i]} = ${factory}({ type: '${escString(node.type)}', version: ${node.typeVersion}, config: { name: '${escString(node.name)}', parameters: ${params} } });`;
  });

  let chain = `export default workflow('${wfId}', '${wfName}').add(${varNames[0]})`;
  for (let i = 1; i < varNames.length; i++) {
    chain += `.to(${varNames[i]})`;
  }
  if (!varNames.length) {
    chain = `export default workflow('${wfId}', '${wfName}')`;
  }

  return `import { workflow, node, trigger } from '@n8n/workflow-sdk';\n${decls.join('\n')}\n${chain};`;
}
