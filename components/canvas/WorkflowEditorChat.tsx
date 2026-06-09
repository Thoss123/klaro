"use client";

/**
 * Workflow-Editor-Chat — gleicher Klaro-Kontext wie Haupt-Chat,
 * Antworten bleiben nur im Editor (nicht im linken Chat-Flow).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import ChatPendingLoader from '@/components/chat/ChatPendingLoader';
import { StepConfig, Workflow, WorkflowEdge, WorkflowStep } from '@/lib/types';
import type { WorkflowEditorCoachContext, WorkflowEditorChatTurn } from '@/lib/workflow-editor-context';
import { inputFieldsForStep, type NodeRunLite } from '@/lib/workflow-io';
import ChatInput from '@/components/chat/ChatInput';
import type { ChatAttachment } from '@/lib/chat-attachments';

export type WorkflowEditorUpdate = {
  steps: WorkflowStep[];
  edges: WorkflowEdge[];
  message?: string;
  stepConfigUpdates?: Record<string, Partial<StepConfig>>;
  openStepId?: string;
};

export type OmittedChatInputProps = never;

export default function WorkflowEditorChat({
  workflow,
  stepConfigs,
  workflowDbId,
  coachContext,
  runData = [],
  runError = '',
  onWorkflowUpdate,
  disabled,
}: {
  workflow: Workflow;
  stepConfigs?: Record<string, StepConfig>;
  workflowDbId?: string;
  coachContext?: WorkflowEditorCoachContext;
  runData?: NodeRunLite[];
  /** Fehler aus einem fehlgeschlagenen Testlauf ohne Per-Node-Daten (z. B. „Workflow hat Probleme“). */
  runError?: string;
  onWorkflowUpdate: (update: WorkflowEditorUpdate) => void;
  disabled?: boolean;
}) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [editorMessages, setEditorMessages] = useState<WorkflowEditorChatTurn[]>([]);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditorMessages([]);
  }, [workflow.id]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [editorMessages, loading]);

  // Autofill message on per-node error
  const prevRunDataRef = useRef(runData);
  useEffect(() => {
    if (runData !== prevRunDataRef.current) {
      const newErrors = runData.filter(r => r.status === 'error' && !prevRunDataRef.current?.find(p => p.node === r.node && p.status === 'error'));
      if (newErrors.length > 0) {
        const errorMsg = newErrors[0];
        setMessage(prev => prev ? prev : `Der Schritt "${errorMsg.node}" hat einen Fehler: ${errorMsg.error || 'Unbekannt'}. Was bedeutet das und kannst du es bitte direkt für mich beheben?`);
      }
      prevRunDataRef.current = runData;
    }
  }, [runData]);

  // Autofill message on pre-execution error (kein Per-Node-runData, z. B. „Workflow hat Probleme").
  const prevRunErrorRef = useRef('');
  useEffect(() => {
    if (runError && runError !== prevRunErrorRef.current) {
      prevRunErrorRef.current = runError;
      setMessage(prev => prev ? prev : `Beim Testen kam dieser Fehler: „${runError}". Was bedeutet das und kannst du es bitte direkt für mich beheben?`);
    }
    if (!runError) prevRunErrorRef.current = '';
  }, [runError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && attachments.length === 0) return;

    setLoading(true);
    setEditorMessages(prev => [...prev, { role: 'user', content: message }]);
    const currentMsg = message;
    const currentAtt = attachments;
    setMessage('');
    setAttachments([]);

    try {
      const flatRun = runData.flatMap(r =>
        (r.json || []).slice(0, 3).map((item, i) =>
          `[Run ${r.node} #${i}]: ${JSON.stringify(item)}`
        )
      );

      const ioContext = workflow.steps.map(s => {
        const iF = inputFieldsForStep(s, workflow.steps, workflow.edges ?? [], runData);
        if (!iF.length) return null;
        return `${s.label} Inputs:\n${iF.map(f => ` - ${f.path} (${f.sample})`).join('\n')}`;
      }).filter(Boolean).join('\n\n');

      const fullContext = [
        ...editorMessages,
        { role: 'user', content: currentMsg }
      ];

      const res = await fetch('/api/agents/workflow-editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: currentMsg,
          workflow,
          stepConfigs,
          workflowDbId,
          coachContext,
          history: fullContext,
          attachments: currentAtt,
          runDataSummary: flatRun.slice(0, 20).join('\n'),
          ioContext,
        }),
      });

      if (!res.ok) throw new Error('Network response was not ok');

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
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[min(560px,calc(100%-2rem))] pointer-events-auto flex flex-col gap-2 shadow-xl rounded-3xl">
      {(editorMessages.length > 0 || loading) && (
        <div
          ref={threadRef}
          className="max-h-40 overflow-y-auto rounded-2xl border border-gray-100 bg-white/95 backdrop-blur-sm shadow-lg px-4 py-3 space-y-2 text-sm mx-1"
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
            <div className="mt-3">
              <ChatPendingLoader />
            </div>
          )}
        </div>
      )}

      <ChatInput
        value={message}
        onChange={setMessage}
        onSubmit={handleSubmit}
        disabled={disabled || loading}
        isStreaming={false}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        sessionId={coachContext?.sessionId}
        compact={true}
      />
    </div>
  );
}
