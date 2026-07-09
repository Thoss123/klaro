/**
 * Tests für den neuen Axantilo-Chat-Model-Default: ensureRequiredSubNodes/attachSubNode
 * hängen jetzt lmChatOpenAi (statt lmChatMistralCloud) an, mit tool: 'axantilo_ai',
 * credentialType: 'openAiApi' und einer Modell-Parameter, die auf Mistral zeigt.
 */
import { describe, it, expect } from 'vitest';
import { attachSubNode, ensureRequiredSubNodes } from '@/lib/ai-subnodes';
import { AXANTILO_AI_TOOL } from '@/lib/axantilo-llm-credential';
import type { StepConfig, WorkflowStep } from '@/lib/types';
import type { N8nCatalogIndexEntry } from '@/lib/n8n-catalog-types';

const AGENT = '@n8n/n8n-nodes-langchain.agent';
const CHAIN = '@n8n/n8n-nodes-langchain.chainLlm';

const openAiEntryV13: N8nCatalogIndexEntry = {
  name: '@n8n/n8n-nodes-langchain.lmChatOpenAi', displayName: 'OpenAI Chat Model',
  version: 1.3, groups: [], categories: ['AI'], aliases: [], hasCredentials: true,
  credentialTypes: ['openAiApi'], iconPath: null, axantiloCategory: 'ai',
};

const openAiEntryV1: N8nCatalogIndexEntry = { ...openAiEntryV13, version: 1 };

const index: N8nCatalogIndexEntry[] = [openAiEntryV13];

describe('ensureRequiredSubNodes — Axantilo Chat Model als Default', () => {
  it('hängt lmChatOpenAi mit tool=axantilo_ai an einen AI Agent', () => {
    const steps: WorkflowStep[] = [
      { id: 't', label: 'Start', type: 'trigger', n8nType: 'n8n-nodes-base.manualTrigger' },
      { id: 'a', label: 'Support-Agent', type: 'ai', n8nType: AGENT },
    ];
    const { steps: out, edges } = ensureRequiredSubNodes(steps, [], index);
    const sub = out.find(s => s.subNodeOf?.parentId === 'a');
    expect(sub).toBeDefined();
    expect(sub!.n8nType).toBe('@n8n/n8n-nodes-langchain.lmChatOpenAi');
    expect(sub!.tool).toBe(AXANTILO_AI_TOOL);
    expect(sub!.credentialType).toBe('openAiApi');
    expect(sub!.label).toBe('Axantilo Chat Model');
    expect(edges.some(e => e.connectionType === 'ai_languageModel' && e.target === 'a')).toBe(true);
  });

  it('hängt lmChatOpenAi auch an eine Basic LLM Chain', () => {
    const steps: WorkflowStep[] = [
      { id: 't', label: 'Start', type: 'trigger', n8nType: 'n8n-nodes-base.manualTrigger' },
      { id: 'c', label: 'Zusammenfassung', type: 'ai', n8nType: CHAIN },
    ];
    const { steps: out } = ensureRequiredSubNodes(steps, [], index);
    const sub = out.find(s => s.subNodeOf?.parentId === 'c');
    expect(sub!.tool).toBe(AXANTILO_AI_TOOL);
  });

  it('setzt ein Mistral-Modell (String) auf typeVersion < 1.2', () => {
    const steps: WorkflowStep[] = [{ id: 'a', label: 'Agent', type: 'ai', n8nType: AGENT }];
    const { steps: out } = ensureRequiredSubNodes(steps, [], [openAiEntryV1]);
    const sub = out.find(s => s.subNodeOf?.parentId === 'a')!;
    expect(typeof (sub.parameters as StepConfig['parameters'])?.model).toBe('string');
    expect(String((sub.parameters as Record<string, unknown>).model)).toMatch(/mistral/);
  });

  it('setzt ein Mistral-Modell als resourceLocator-Objekt auf typeVersion >= 1.2', () => {
    const steps: WorkflowStep[] = [{ id: 'a', label: 'Agent', type: 'ai', n8nType: AGENT }];
    const { steps: out } = ensureRequiredSubNodes(steps, [], [openAiEntryV13]);
    const sub = out.find(s => s.subNodeOf?.parentId === 'a')!;
    const model = (sub.parameters as Record<string, unknown>).model as { __rl: boolean; mode: string; value: string };
    expect(model.__rl).toBe(true);
    expect(model.mode).toBe('id');
    expect(model.value).toMatch(/mistral/);
  });

  it('disabled die Responses-API (unser Proxy spricht nur Chat Completions)', () => {
    const steps: WorkflowStep[] = [{ id: 'a', label: 'Agent', type: 'ai', n8nType: AGENT }];
    const { steps: out } = ensureRequiredSubNodes(steps, [], [openAiEntryV13]);
    const sub = out.find(s => s.subNodeOf?.parentId === 'a')!;
    const options = (sub.parameters as Record<string, unknown>).options as { responsesApiEnabled: boolean };
    expect(options.responsesApiEnabled).toBe(false);
  });

  it('ist idempotent — kein doppeltes Anhängen bei zweitem Durchlauf', () => {
    const steps: WorkflowStep[] = [{ id: 'a', label: 'Agent', type: 'ai', n8nType: AGENT }];
    const once = ensureRequiredSubNodes(steps, [], index);
    const twice = ensureRequiredSubNodes(once.steps, once.edges, index);
    const subCount = twice.steps.filter(s => s.subNodeOf?.parentId === 'a').length;
    expect(subCount).toBe(1);
  });
});

describe('attachSubNode — manuelle Auswahl bleibt eine ECHTE OpenAI-Node', () => {
  it('markiert NICHT als axantilo_ai, wenn der Nutzer lmChatOpenAi manuell aus dem Katalog wählt', () => {
    const steps: WorkflowStep[] = [{ id: 'a', label: 'Agent', type: 'ai', n8nType: AGENT }];
    // Kein opts.isAxantiloDefault → simuliert eine manuelle Auswahl im Node-Picker.
    const { steps: out } = attachSubNode(steps, [], 'a', 'ai_languageModel', openAiEntryV13);
    const sub = out.find(s => s.subNodeOf?.parentId === 'a')!;
    expect(sub.tool).toBe('lmChatOpenAi');
    expect(sub.tool).not.toBe(AXANTILO_AI_TOOL);
    expect(sub.label).not.toBe('Axantilo Chat Model');
  });
});
