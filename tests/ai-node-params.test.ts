import { describe, it, expect } from 'vitest';
import { buildAiNodeParameters, buildParameters } from '@/lib/workflow-deploy';
import { ensureRequiredSubNodes } from '@/lib/ai-subnodes';
import type { StepConfig, WorkflowStep } from '@/lib/types';
import type { N8nCatalogIndexEntry } from '@/lib/n8n-catalog-types';

const AGENT = '@n8n/n8n-nodes-langchain.agent';
const CHAIN = '@n8n/n8n-nodes-langchain.chainLlm';

describe('buildAiNodeParameters', () => {
  it('maps an AI Agent to promptType/text + options.systemMessage', () => {
    const p = buildAiNodeParameters(AGENT, 'SYS', 'USER') as Record<string, unknown>;
    expect(p.promptType).toBe('define');
    expect(p.text).toBe('USER');
    expect((p.options as { systemMessage: string }).systemMessage).toBe('SYS');
  });

  it('maps a Basic LLM Chain to a SystemMessagePromptTemplate', () => {
    const p = buildAiNodeParameters(CHAIN, 'SYS') as Record<string, unknown>;
    const mv = (p.messages as { messageValues: Array<{ type: string; message: string }> }).messageValues;
    expect(mv[0].type).toBe('SystemMessagePromptTemplate');
    expect(mv[0].message).toBe('SYS');
    // No user prompt → expression default that reads upstream data.
    expect(String(p.text)).toContain('$json');
  });

  it('returns undefined for non-AI node types', () => {
    expect(buildAiNodeParameters('n8n-nodes-base.set', 'SYS')).toBeUndefined();
  });
});

describe('buildParameters — AI systemPrompt wiring', () => {
  const agentStep: WorkflowStep = { id: 's2', label: 'KI', type: 'ai', n8nType: AGENT };

  it('turns a config.systemPrompt into n8n agent parameters', () => {
    const config: StepConfig = { configType: 'ai', systemPrompt: 'Erzeuge das Angebot …' };
    const p = buildParameters(agentStep, config)!;
    expect((p.options as { systemMessage: string }).systemMessage).toBe('Erzeuge das Angebot …');
  });

  it('lets explicit config.parameters win over the systemPrompt', () => {
    const config: StepConfig = { configType: 'ai', systemPrompt: 'X', parameters: { foo: 'bar' } };
    expect(buildParameters(agentStep, config)).toEqual({ foo: 'bar' });
  });

  it('returns undefined when there is nothing to set', () => {
    expect(buildParameters({ id: 's', label: 'Set', type: 'output', n8nType: 'n8n-nodes-base.set' })).toBeUndefined();
  });
});

describe('ensureRequiredSubNodes', () => {
  const index: N8nCatalogIndexEntry[] = [
    {
      name: '@n8n/n8n-nodes-langchain.lmChatMistralCloud', displayName: 'Mistral Cloud Chat Model',
      version: 1, groups: [], categories: ['AI'], aliases: [], hasCredentials: true,
      credentialTypes: ['mistralCloudApi'], iconPath: null, axantiloCategory: 'ai',
    },
  ];

  it('attaches a required chat-model sub-node to an AI Agent', () => {
    const steps: WorkflowStep[] = [
      { id: 't', label: 'Start', type: 'trigger', n8nType: 'n8n-nodes-base.manualTrigger' },
      { id: 'a', label: 'Angebot-Agent', type: 'ai', n8nType: AGENT },
    ];
    const { steps: out, edges } = ensureRequiredSubNodes(steps, [], index);
    const sub = out.find(s => s.subNodeOf?.parentId === 'a');
    expect(sub).toBeDefined();
    expect(sub!.n8nType).toBe('@n8n/n8n-nodes-langchain.lmChatMistralCloud');
    expect(edges.some(e => e.connectionType === 'ai_languageModel' && e.target === 'a')).toBe(true);
  });

  it('is idempotent — no duplicate sub-node on a second pass', () => {
    const steps: WorkflowStep[] = [{ id: 'a', label: 'Agent', type: 'ai', n8nType: AGENT }];
    const once = ensureRequiredSubNodes(steps, [], index);
    const twice = ensureRequiredSubNodes(once.steps, once.edges, index);
    const subCount = twice.steps.filter(s => s.subNodeOf?.parentId === 'a').length;
    expect(subCount).toBe(1);
  });
});
