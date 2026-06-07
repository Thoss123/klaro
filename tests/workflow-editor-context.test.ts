import { describe, it, expect } from 'vitest';
import {
  formatCoachContextBlock,
  mainChatHistoryForEditor,
} from '@/lib/workflow-editor-context';

describe('workflow-editor-context', () => {
  it('extracts stripped main chat history', () => {
    const history = mainChatHistoryForEditor([
      { id: '1', role: 'user', content: 'Hallo' },
      { id: '2', role: 'assistant', content: 'Hi <tool_call>{"type":"edit_workflow"}</tool_call>' },
    ]);
    expect(history).toHaveLength(2);
    expect(history[1].content).toBe('Hi');
  });

  it('includes firm and main chat in context block', () => {
    const block = formatCoachContextBlock({
      phase: 'umsetzung',
      onboarding: { firmenname: 'Acme', memory: 'Nutzt Gmail' } as never,
      mainChatHistory: [{ role: 'user', content: 'Mistral statt OpenAI' }],
      activeWorkflowId: 'wf_1',
    });
    expect(block).toContain('Acme');
    expect(block).toContain('Mistral statt OpenAI');
    expect(block).toContain('umsetzung');
  });
});
