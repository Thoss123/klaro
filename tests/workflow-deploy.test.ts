/**
 * Tests für lib/workflow-deploy.ts — Fokus auf die neuen Axantilo-Chat-Model-Pfade:
 * mappingToolForStep() muss den axantilo_ai-Marker über den Deploy/Sync-Mapping-Schritt
 * hinweg erhalten (sonst bindet die Deploy-Route die Proxy-Credential nicht), und
 * isConfigured() darf für axantilo_ai KEINE User-Credential verlangen.
 */
import { describe, it, expect } from 'vitest';
import { isConfigured, mappingToolForStep } from '@/lib/workflow-deploy';
import { AXANTILO_AI_TOOL } from '@/lib/axantilo-llm-credential';
import type { WorkflowStep } from '@/lib/types';

describe('mappingToolForStep', () => {
  it('preserves the axantilo_ai marker regardless of n8nType', () => {
    const step: WorkflowStep = {
      id: 's', label: 'Axantilo Chat Model', type: 'ai',
      n8nType: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      tool: AXANTILO_AI_TOOL,
    };
    expect(mappingToolForStep(step, step.n8nType)).toBe(AXANTILO_AI_TOOL);
  });

  it('derives the tool from n8nType for a normal step (unchanged behavior)', () => {
    const step: WorkflowStep = { id: 's', label: 'Gmail', type: 'action', n8nType: 'n8n-nodes-base.gmail', tool: 'gmail' };
    expect(mappingToolForStep(step, step.n8nType)).toBe('gmail');
  });

  it('derives the tool from n8nType for a real (non-Axantilo) OpenAI Chat Model sub-node', () => {
    const step: WorkflowStep = {
      id: 's', label: 'OpenAI Chat Model', type: 'ai',
      n8nType: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      tool: 'lmChatOpenAi',
    };
    expect(mappingToolForStep(step, step.n8nType)).toBe('lmChatOpenAi');
  });

  it('returns undefined when n8nType is absent', () => {
    const step: WorkflowStep = { id: 's', label: 'Unresolved', type: 'action' };
    expect(mappingToolForStep(step, undefined)).toBeUndefined();
  });
});

describe('isConfigured — axantilo_ai treated as centrally satisfied', () => {
  it('is configured without a credentialValue when tool=axantilo_ai', () => {
    const step: WorkflowStep = {
      id: 's', label: 'Axantilo Chat Model', type: 'ai',
      n8nType: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      tool: AXANTILO_AI_TOOL,
      credentialType: 'openAiApi',
      subNodeOf: { parentId: 'a', slot: 'ai_languageModel' },
    };
    expect(isConfigured(step)).toBe(true);
  });

  it('still requires a credentialValue for a real OpenAI sub-node (not central)', () => {
    const step: WorkflowStep = {
      id: 's', label: 'OpenAI Chat Model', type: 'ai',
      n8nType: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      tool: 'lmChatOpenAi',
      credentialType: 'openAiApi',
      subNodeOf: { parentId: 'a', slot: 'ai_languageModel' },
    };
    expect(isConfigured(step)).toBe(false);
  });
});
