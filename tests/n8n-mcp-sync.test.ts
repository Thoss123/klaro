import { describe, expect, it } from 'vitest';
import { buildMcpParameterOperations } from '@/lib/n8n-mcp-sync';
import type { Workflow } from '@/lib/types';

describe('buildMcpParameterOperations', () => {
  it('erzeugt updateNodeParameters pro Schritt mit Parametern', () => {
    const wf: Workflow = {
      id: 'wf1',
      title: 'Test',
      steps: [
        { id: 's1', label: 'Webhook', type: 'trigger', n8nType: 'n8n-nodes-base.webhook' },
      ],
      edges: [],
    };
    const ops = buildMcpParameterOperations(wf, {
      s1: {
        configType: 'n8n',
        n8nType: 'n8n-nodes-base.webhook',
        parameters: { httpMethod: 'POST', path: 'klaro-test' },
      },
    });
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      operation: 'updateNodeParameters',
      nodeName: 'Webhook',
      parameters: { httpMethod: 'POST', path: 'klaro-test' },
    });
  });
});
