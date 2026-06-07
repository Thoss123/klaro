"use client";

/**
 * Workflow-Editor-Chat — gleicher Klaro-Kontext wie Haupt-Chat,
 * Antworten bleiben nur im Editor (nicht im linken Chat-Flow).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { StepConfig, Workflow, WorkflowEdge, WorkflowStep } from '@/lib/types';
import type { WorkflowEditorCoachContext, WorkflowEditorChatTurn } from '@/lib/workflow-editor-context';

export type WorkflowEditorUpdate = {
  steps: WorkflowStep[];
  edges: WorkflowEdge[];
  message?: string;
  stepConfigUpdates?: Record<string, Partial<StepConfig>>;
  openStepId?: string;
};

export default function WorkflowEditorChat({
  workflow,
  stepConfigs,
  workflowDbId,
  coachContext,
  onWorkflowUpdate,
  disabled,
}: {
  workflow: Workflow;
  stepConfigs?: Record<string, StepConfig>;
  workflowDbId?: string;
  coachContext?: WorkflowEditorCoachContext;
  onWorkflowUpdate: (update: WorkflowEditorUpdate) => void;
  disabled?: boolean;
}) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [editorMessages, setEditorMessages] = useState<WorkflowEditorChatTurn[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditorMessages([]);
  }, [workflow.id]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [editorMessages, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || loading || disabled) return;

    const userTurn: WorkflowEditorChatTurn = { role: 'user', content: text };
    setEditorMessages(prev => [...prev, userTurn]);
    setMessage('');
    setLoading(true);

    try {
      const res = await fetch('/api/n8n/workflow-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow,
          message: text,
          step_configs: stepConfigs ?? {},
          workflow_db_id: workflowDbId,
          coach_context: {
            ...coachContext,
            activeWorkflowId: workflow.id,
            editorHistory: [...editorMessages, userTurn],
          },
        }),
      });
      if (!res.ok) throw new Error('Anfrage fehlgeschlagen');
      const data = await res.json() as WorkflowEditorUpdate & {
        changed?: boolean;
        mcpSynced?: boolean;
        mcpSyncNote?: string;
      };

      if (data.steps?.length) {
        onWorkflowUpdate({
          steps: data.steps,
          edges: data.edges ?? [],
          message: data.message,
          stepConfigUpdates: data.stepConfigUpdates,
          openStepId: data.openStepId,
        });
      }

      const syncHint = data.mcpSyncNote ? ` ${data.mcpSyncNote}` : '';
      const reply =
        (data.message || (data.changed ? 'Workflow aktualisiert.' : 'Keine Änderung erkannt — formuliere konkreter.'))
        + syncHint;

      setEditorMessages(prev => [...prev, { role: 'assistant', content: reply.trim() }]);
    } catch {
      setEditorMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Fehler — bitte erneut versuchen.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[min(560px,calc(100%-2rem))] pointer-events-auto flex flex-col gap-2">
      {(editorMessages.length > 0 || loading) && (
        <div
          ref={threadRef}
          className="max-h-40 overflow-y-auto rounded-2xl border border-gray-100 bg-white/95 backdrop-blur-sm shadow-lg px-4 py-3 space-y-2 text-sm"
        >
          {editorMessages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={m.role === 'user' ? 'text-right' : 'text-left'}
            >
              <span
                className={
                  m.role === 'user'
                    ? 'inline-block max-w-[92%] text-left rounded-2xl px-3 py-2 bg-indigo-600 text-white whitespace-pre-line'
                    : 'block text-gray-700 whitespace-pre-line leading-relaxed'
                }
              >
                {m.content}
              </span>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-gray-400 text-xs">
              <Loader2 size={14} className="animate-spin" />
              Klaro passt den Workflow an…
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white/95 backdrop-blur-sm rounded-2xl border border-gray-200 shadow-xl px-4 py-3 flex items-center gap-3"
      >
        <input
          type="text"
          value={message}
          onChange={e => setMessage(e.target.value)}
          disabled={disabled || loading}
          placeholder="Wie im Coach-Chat — z.B. „statt ChatGPT Mistral in allen KI-Schritten“"
          className="flex-1 text-sm bg-transparent border-none outline-none text-gray-800 placeholder:text-gray-400 min-w-0"
        />
        <button
          type="submit"
          disabled={disabled || loading || !message.trim()}
          className="shrink-0 w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          aria-label="Senden"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>
    </div>
  );
}
