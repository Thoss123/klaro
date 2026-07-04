/**
 * Tests für applyWorkflowEdit — der deterministische Phase-4-Edit ohne zweiten LLM.
 * Katalog + Setup-Anreicherung werden gemockt (kein Netzwerk).
 */

import { describe, it, expect, vi } from 'vitest';

const INDEX = [
  'n8n-nodes-base.webhook|Webhook|trigger',
  'n8n-nodes-base.gmail|Gmail|action|gmailOAuth2',
  'n8n-nodes-base.slack|Slack|action|slackApi',
  '@n8n/n8n-nodes-langchain.chainLlm|Basic LLM Chain|ai',
  '@n8n/n8n-nodes-langchain.agent|AI Agent|ai',
  '@n8n/n8n-nodes-langchain.lmChatMistralCloud|Mistral Cloud Chat Model|ai',
  'n8n-nodes-base.if|If|flow',
].map(s => {
  const [name, displayName, axantiloCategory, cred] = s.split('|');
  return {
    name, displayName, version: 1, groups: ['transform'], categories: [],
    aliases: [], hasCredentials: !!cred, credentialTypes: cred ? [cred] : [],
    iconPath: null, axantiloCategory,
  };
});

vi.mock('@/lib/n8n-catalog', () => ({
  getCatalogIndex: async () => INDEX,
  getN8nCatalog: async () => ({ nodes: INDEX.map(e => ({ name: e.name, displayName: e.displayName, version: 1, properties: [] })), credentials: [], fetchedAt: '', source: 'mock' }),
  getNodeByName: (cat: { nodes: { name: string }[] }, name: string) => cat.nodes.find(n => n.name === name),
  buildDefaultParameters: () => ({}),
}));

// Setup-Anreicherung neutralisieren (würde sonst den Katalog erneut laden).
vi.mock('@/lib/workflow-setup-coach', () => ({
  enrichStepsWithSetup: async (_wf: unknown, steps: unknown[]) => ({ steps, stepConfigUpdates: {} }),
}));

import { applyWorkflowEdit } from '@/lib/apply-workflow-edit';
import type { Workflow } from '@/lib/types';

const baseWorkflow: Workflow = {
  id: 'wf1',
  title: 'Test',
  linked_pain_point: 'pp1',
  steps: [
    { id: 's1', label: 'Start', type: 'trigger', tool: 'webhook', n8nType: 'n8n-nodes-base.webhook', parameters: { path: 'abc' } },
    { id: 's2', label: 'Entwurf', type: 'ai', tool: 'chainLlm', n8nType: '@n8n/n8n-nodes-langchain.chainLlm', parameters: { prompt: 'hallo' } },
    { id: 's3', label: 'Senden', type: 'action', tool: 'gmail', n8nType: 'n8n-nodes-base.gmail', credentialType: 'gmailOAuth2', parameters: { to: 'x@y.de' } },
  ],
  edges: [
    { id: 'e1', source: 's1', target: 's2', branch: 'default' },
    { id: 'e2', source: 's2', target: 's3', branch: 'default' },
  ],
};

describe('applyWorkflowEdit', () => {
  it('behält Konfiguration unveränderter Schritte (per id)', async () => {
    const out = await applyWorkflowEdit(baseWorkflow, [
      { id: 's1', label: 'Start', type: 'trigger', tool: 'webhook' },
      { id: 's2', label: 'Entwurf', type: 'ai', tool: 'chainLlm' },
      { id: 's3', label: 'Senden', type: 'action', tool: 'gmail' },
    ]);
    const s3 = out.steps.find(s => s.id === 's3');
    expect(s3?.n8nType).toBe('n8n-nodes-base.gmail');
    expect(s3?.credentialType).toBe('gmailOAuth2');
    expect(s3?.parameters).toMatchObject({ to: 'x@y.de' });
  });

  it('löst einen geänderten Schritt neu auf (Tool gewechselt)', async () => {
    const out = await applyWorkflowEdit(baseWorkflow, [
      { id: 's1', label: 'Start', type: 'trigger', tool: 'webhook' },
      { id: 's2', label: 'Entwurf', type: 'ai', tool: 'chainLlm' },
      { id: 's3', label: 'In Slack posten', type: 'action', tool: 'slack' },
    ]);
    const s3 = out.steps.find(s => s.id === 's3');
    expect(s3?.n8nType).toBe('n8n-nodes-base.slack');
  });

  it('löscht weggelassene Schritte', async () => {
    const out = await applyWorkflowEdit(baseWorkflow, [
      { id: 's1', label: 'Start', type: 'trigger', tool: 'webhook' },
      { id: 's2', label: 'Entwurf', type: 'ai', tool: 'chainLlm' },
    ]);
    expect(out.steps.find(s => s.id === 's3')).toBeUndefined();
  });

  it('baut eine Freigabe (human) als sendAndWait → IF → Loopback', async () => {
    const out = await applyWorkflowEdit(baseWorkflow, [
      { id: 's1', label: 'Start', type: 'trigger', tool: 'webhook' },
      { id: 's2', label: 'Entwurf', type: 'ai', tool: 'chainLlm' },
      { id: 's3', label: 'Freigabe einholen', type: 'human', tool: 'gmail' },
      { label: 'Senden', type: 'action', tool: 'gmail' },
    ]);
    const human = out.steps.find(s => s.id === 's3');
    expect(human?.parameters?.operation).toBe('sendAndWait');
    const ifStep = out.steps.find(s => s.n8nType === 'n8n-nodes-base.if');
    expect(ifStep).toBeDefined();
    // Loopback (false) vom IF zurück zum Erzeuger (s2)
    expect(out.edges.some(e => e.source === ifStep!.id && e.target === 's2' && e.branch === 'false')).toBe(true);
    expect(out.changed).toBe(true);
  });
});
