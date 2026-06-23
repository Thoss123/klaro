/**
 * Axantilo/n8n-Workflow-JSON → n8n Workflow SDK Code für MCP validate_workflow.
 */

const TRIGGER_RE = /Trigger$|\.webhook$|\.mcpTrigger$|\.formTrigger$/;

function isTriggerNodeType(type: string): boolean {
  return TRIGGER_RE.test(type);
}

function escapeJsString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function varName(index: number): string {
  return `n${index}`;
}

export interface N8nWorkflowJsonForSdk {
  name: string;
  nodes: Array<{
    name: string;
    type: string;
    typeVersion: number;
    parameters?: Record<string, unknown>;
  }>;
}

/** Erzeugt minimales lineares SDK-Skript aus deploybarem n8n-JSON. */
export function workflowJsonToSdkCode(workflowJson: N8nWorkflowJsonForSdk): string {
  const nodes = workflowJson.nodes ?? [];
  if (nodes.length === 0) {
    return `import { workflow, trigger } from '@n8n/workflow-sdk';
const start = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Start' } });
export default workflow('axantilo-empty', 'Empty').add(start);`;
  }

  const defs = nodes.map((node, i) => {
    const factory = i === 0 && isTriggerNodeType(node.type) ? 'trigger' : 'node';
    const params = JSON.stringify(node.parameters ?? {});
    return `const ${varName(i)} = ${factory}({
  type: '${escapeJsString(node.type)}',
  version: ${node.typeVersion ?? 1},
  config: { name: '${escapeJsString(node.name)}', parameters: ${params} }
});`;
  });

  const wfId = escapeJsString(
    (workflowJson.name || 'axantilo-workflow').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'axantilo-workflow',
  );
  const wfName = escapeJsString(workflowJson.name || 'Axantilo Workflow');

  let chain = `export default workflow('${wfId}', '${wfName}').add(${varName(0)})`;
  for (let i = 1; i < nodes.length; i++) {
    chain += `.to(${varName(i)})`;
  }

  return `import { workflow, node, trigger } from '@n8n/workflow-sdk';

${defs.join('\n\n')}

${chain};`;
}
