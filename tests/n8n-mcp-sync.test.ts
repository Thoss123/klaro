import { describe, expect, it } from 'vitest';
import { buildMcpParameterOperations } from '@/lib/n8n-mcp-sync';
import { alignAuthenticationParameter } from '@/lib/workflow-generator';
import type { Workflow } from '@/lib/types';

describe('buildMcpParameterOperations', () => {
  it('erzeugt updateNodeParameters pro Schritt mit Parametern', () => {
    const wf: Workflow = {
      id: 'wf1',
      title: 'Test',
      linked_pain_point: 'pp1',
      steps: [
        { id: 's1', label: 'Webhook', type: 'trigger', n8nType: 'n8n-nodes-base.webhook' },
      ],
      edges: [],
    };
    const ops = buildMcpParameterOperations(wf, {
      s1: {
        configType: 'n8n',
        n8nType: 'n8n-nodes-base.webhook',
        parameters: { httpMethod: 'POST', path: 'axantilo-test' },
      },
    });
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      operation: 'updateNodeParameters',
      nodeName: 'Webhook',
      parameters: { httpMethod: 'POST', path: 'axantilo-test' },
    });
  });

  it('setzt Credentials per setNodeCredential und repariert authentication "none"', () => {
    const wf: Workflow = {
      id: 'wf1',
      title: 'Test',
      linked_pain_point: 'pp1',
      steps: [
        { id: 's1', label: 'Airtable abrufen', type: 'action', n8nType: 'n8n-nodes-base.airtable' },
      ],
      edges: [],
    };
    const ops = buildMcpParameterOperations(
      wf,
      {
        s1: {
          configType: 'n8n',
          n8nType: 'n8n-nodes-base.airtable',
          credentialType: 'airtableTokenApi',
          // Alter, kaputter Stand aus der DB — darf so nie wieder bei n8n ankommen.
          parameters: { authentication: 'none', operation: 'get' },
        },
      },
      undefined,
      [{
        step_id: 's1',
        tool: 'airtable',
        n8n_type: 'n8n-nodes-base.airtable',
        credential_type: 'airtableTokenApi',
        credential_id: 'n8nCred123',
      }],
    );

    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({
      operation: 'updateNodeParameters',
      nodeName: 'Airtable abrufen',
      parameters: { authentication: 'airtableTokenApi', operation: 'get' },
    });
    expect(ops[1]).toEqual({
      operation: 'setNodeCredential',
      nodeName: 'Airtable abrufen',
      credentialKey: 'airtableTokenApi',
      credentialId: 'n8nCred123',
      credentialName: 'airtableTokenApi-credential',
    });
  });

  it('löst den Credential-Typ auch ohne Mapping über die Tool-Map auf', () => {
    const wf: Workflow = {
      id: 'wf1',
      title: 'Test',
      linked_pain_point: 'pp1',
      steps: [
        { id: 's1', label: 'Airtable', type: 'action', n8nType: 'n8n-nodes-base.airtable' },
      ],
      edges: [],
    };
    const ops = buildMcpParameterOperations(
      wf,
      { s1: { configType: 'n8n', n8nType: 'n8n-nodes-base.airtable', parameters: { operation: 'search' } } },
      undefined,
      [{ step_id: 's1', tool: 'airtable', credential_id: 'n8nCred123' }],
    );

    expect(ops.find(o => o.operation === 'setNodeCredential')).toMatchObject({
      credentialKey: 'airtableTokenApi',
      credentialId: 'n8nCred123',
    });
  });

  it('ohne Credential: kein setNodeCredential, authentication "none" wird entfernt', () => {
    const wf: Workflow = {
      id: 'wf1',
      title: 'Test',
      linked_pain_point: 'pp1',
      steps: [
        { id: 's1', label: 'Airtable', type: 'action', n8nType: 'n8n-nodes-base.airtable' },
      ],
      edges: [],
    };
    const ops = buildMcpParameterOperations(wf, {
      s1: {
        configType: 'n8n',
        n8nType: 'n8n-nodes-base.airtable',
        parameters: { authentication: 'none', operation: 'get' },
      },
    });

    expect(ops).toHaveLength(1);
    expect(ops[0].operation).toBe('updateNodeParameters');
    expect((ops[0] as { parameters: Record<string, unknown> }).parameters).toEqual({ operation: 'get' });
  });
});

describe('alignAuthenticationParameter', () => {
  it('ersetzt "none" durch den Credential-Typ, wenn ein Credential da ist', () => {
    expect(alignAuthenticationParameter({ authentication: 'none' }, 'airtableTokenApi', true))
      .toEqual({ authentication: 'airtableTokenApi' });
  });

  it('setzt authentication auch, wenn es fehlt', () => {
    expect(alignAuthenticationParameter({}, 'airtableTokenApi', true))
      .toEqual({ authentication: 'airtableTokenApi' });
  });

  it('lässt explizit gewählte Auth-Methoden unangetastet', () => {
    expect(alignAuthenticationParameter({ authentication: 'airtableOAuth2Api' }, 'airtableTokenApi', true))
      .toEqual({ authentication: 'airtableOAuth2Api' });
  });

  it('entfernt "none" ohne Credential und mutiert das Original nicht', () => {
    const original = { authentication: 'none', operation: 'get' };
    expect(alignAuthenticationParameter(original, undefined, false)).toEqual({ operation: 'get' });
    expect(original.authentication).toBe('none');
  });
});
