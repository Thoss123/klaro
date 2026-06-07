import { describe, it, expect } from 'vitest';
import {
  buildN8nWorkflow,
  getRequiredCredentials,
  withKlaroPrefix,
  KLARO_WORKFLOW_PREFIX,
  NODE_TYPE,
  type StepMapping,
} from '@/lib/workflow-generator';
import type { Workflow } from '@/lib/types';

const wf: Workflow = {
  id: 'wf_1',
  title: 'Reels Pipeline',
  linked_pain_point: 'pp_1',
  steps: [
    { id: 's1', label: 'Start', type: 'trigger' },
    { id: 's2', label: 'KI Skript', type: 'ai' },
    { id: 's3', label: 'Freigabe?', type: 'decision' },
    { id: 's4', label: 'Posten', type: 'output' },
  ],
};

describe('withKlaroPrefix', () => {
  it('adds the prefix once', () => {
    expect(withKlaroPrefix('Foo')).toBe('KLARO: Foo');
  });
  it('does not double-prefix and normalizes spacing', () => {
    expect(withKlaroPrefix('KLARO: Foo')).toBe('KLARO: Foo');
    expect(withKlaroPrefix('klaro:Foo')).toBe('KLARO: Foo');
  });
  it('falls back to a default name when empty', () => {
    expect(withKlaroPrefix('')).toBe('KLARO: Workflow');
  });
});

describe('buildN8nWorkflow', () => {
  const mappings: StepMapping[] = [
    { step_id: 's1', tool: 'webhook' },
    { step_id: 's2', tool: 'openai', credential_id: 'cred_ai' },
    { step_id: 's3', tool: 'decision' },
    { step_id: 's4', tool: 'gmail', credential_id: 'cred_gmail' },
  ];

  it('prefixes the n8n workflow name with KLARO:', () => {
    const json = buildN8nWorkflow(wf, mappings, 'Reels Pipeline') as any;
    expect(json.name.startsWith(KLARO_WORKFLOW_PREFIX)).toBe(true);
  });

  it('creates one node per step with mapped node types', () => {
    const json = buildN8nWorkflow(wf, mappings, 'X') as any;
    expect(json.nodes).toHaveLength(4);
    expect(json.nodes[0].type).toBe(NODE_TYPE.webhook.type);
    expect(json.nodes[1].type).toBe(NODE_TYPE.openai.type);
  });

  it('wires sequential connections between nodes', () => {
    const json = buildN8nWorkflow(wf, mappings, 'X') as any;
    const firstName = json.nodes[0].name;
    expect(json.connections[firstName].main[0][0].node).toBe(json.nodes[1].name);
  });

  it('attaches credentials only where a credential_id + type exist', () => {
    const json = buildN8nWorkflow(wf, mappings, 'X') as any;
    expect(json.nodes[0].credentials).toBeUndefined(); // webhook → no credential
    expect(json.nodes[1].credentials.openAiApi.id).toBe('cred_ai');
    expect(json.nodes[3].credentials.gmailOAuth2Api.id).toBe('cred_gmail');
  });

  it('positions nodes horizontally and is inactive by default', () => {
    const json = buildN8nWorkflow(wf, mappings, 'X') as any;
    expect(json.active).toBe(false);
    expect(json.nodes[1].position[0]).toBeGreaterThan(json.nodes[0].position[0]);
  });

  it('falls back to set/decision node when a step has no mapping', () => {
    const json = buildN8nWorkflow(wf, [], 'X') as any;
    expect(json.nodes[2].type).toBe(NODE_TYPE.decision.type); // decision step
    expect(json.nodes[1].type).toBe(NODE_TYPE.set.type); // unmapped → set
  });

  it('wires IF true/false branches to correct output indices', () => {
    const branchWf: Workflow = {
      ...wf,
      steps: [
        { id: 's1', label: 'Start', type: 'trigger', n8nType: 'n8n-nodes-base.manualTrigger' },
        { id: 's2', label: 'IF', type: 'decision', n8nType: 'n8n-nodes-base.if' },
        { id: 's3', label: 'Ja', type: 'action' },
        { id: 's4', label: 'Nein', type: 'action' },
      ],
      edges: [
        { id: 'e1', source: 's1', target: 's2', branch: 'default' },
        { id: 'e2', source: 's2', target: 's3', branch: 'true' },
        { id: 'e3', source: 's2', target: 's4', branch: 'false' },
      ],
    };
    const json = buildN8nWorkflow(branchWf, [], 'Branch') as any;
    const ifName = json.nodes[1].name;
    expect(json.connections[ifName].main[0][0].node).toBe(json.nodes[2].name);
    expect(json.connections[ifName].main[1][0].node).toBe(json.nodes[3].name);
  });

  it('wires Merge inputs with target index', () => {
    const mergeWf: Workflow = {
      ...wf,
      steps: [
        { id: 's1', label: 'A', type: 'action' },
        { id: 's2', label: 'B', type: 'action' },
        { id: 's3', label: 'Merge', type: 'output', n8nType: 'n8n-nodes-base.merge' },
      ],
      edges: [
        { id: 'e1', source: 's1', target: 's3', branch: 'default', targetInput: 0 },
        { id: 'e2', source: 's2', target: 's3', branch: 'default', targetInput: 1 },
      ],
    };
    const json = buildN8nWorkflow(mergeWf, [], 'Merge') as any;
    const aName = json.nodes[0].name;
    const bName = json.nodes[1].name;
    const mergeName = json.nodes[2].name;
    expect(json.connections[aName].main[0][0]).toEqual({ node: mergeName, type: 'main', index: 0 });
    expect(json.connections[bName].main[0][0]).toEqual({ node: mergeName, type: 'main', index: 1 });
  });
});

describe('getRequiredCredentials', () => {
  it('returns unique tools that need credentials, skipping credential-less ones', () => {
    const creds = getRequiredCredentials([
      { step_id: 'a', tool: 'gmail' },
      { step_id: 'b', tool: 'gmail' },
      { step_id: 'c', tool: 'webhook' }, // null credential
      { step_id: 'd', tool: 'openai' },
    ]);
    expect(creds.sort()).toEqual(['gmail', 'openai']);
  });
});
