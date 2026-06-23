import { describe, expect, it } from 'vitest';
import { workflowJsonToSdkCode } from '@/lib/workflow-sdk-codegen';

describe('workflowJsonToSdkCode', () => {
  it('erzeugt trigger + node Kette', () => {
    const code = workflowJsonToSdkCode({
      name: 'AXANTILO: Test',
      nodes: [
        {
          name: 'Webhook',
          type: 'n8n-nodes-base.webhook',
          typeVersion: 2,
          parameters: { httpMethod: 'POST', path: 'axantilo-x' },
        },
        {
          name: 'Set',
          type: 'n8n-nodes-base.set',
          typeVersion: 3,
          parameters: { mode: 'manual' },
        },
      ],
    });

    expect(code).toContain("import { workflow, node, trigger }");
    expect(code).toContain('trigger({');
    expect(code).toContain('n8n-nodes-base.webhook');
    expect(code).toContain('.add(n0).to(n1)');
  });
});
