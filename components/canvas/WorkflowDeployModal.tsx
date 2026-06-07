"use client";

/**
 * Phase 4: n8n workflow editor + deploy — ~90% viewport with margin, chat bar on canvas.
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Loader2, Rocket, Play, AlertCircle, Power, PowerOff } from 'lucide-react';
import { Workflow, WorkflowStep, StepConfig } from '@/lib/types';
import WorkflowFlowCanvas from './WorkflowFlowCanvas';
import StepConfigPanel from './StepConfigPanel';
import WorkflowEditorChat, { type WorkflowEditorUpdate } from './WorkflowEditorChat';
import N8nNodePickerModal from './N8nNodePickerModal';
import { configProgress } from '@/lib/workflow-deploy';
import type { N8nCatalogIndexEntry } from '@/lib/n8n-catalog-types';
import type { WorkflowEdge } from '@/lib/types';
import type { WorkflowEditorCoachContext } from '@/lib/workflow-editor-context';

type DeployState = 'idle' | 'deploying' | 'done' | 'error';
type RunState = 'idle' | 'running' | 'done' | 'error';
type PublishState = 'inactive' | 'active' | 'publishing' | 'error';

export default function WorkflowDeployModal({
  workflow,
  stepConfigs,
  activeStep,
  onStepClick,
  onStepSave,
  onStepPanelClose,
  onEdgesUpdate,
  onWorkflowUpdate,
  onStepsUpdate,
  onQuickInsert,
  onDeleteStep,
  onToggleStepDisabled,
  onInsertOnEdge,
  onStepNodeTypeChange,
  onAddStep,
  onAddSubNode,
  deployed,
  deployState,
  runState,
  deployError,
  runError,
  allRequiredConfigured,
  resolving = false,
  workflowDbId,
  publishState = 'inactive',
  publishError = '',
  onDeploy,
  onRun,
  onPublish,
  onClose,
  editorCoachContext,
}: {
  workflow: Workflow;
  stepConfigs: Record<string, StepConfig>;
  activeStep: WorkflowStep | null;
  onStepClick: (step: WorkflowStep) => void;
  onStepSave: (stepId: string, config: StepConfig) => void;
  onStepPanelClose: () => void;
  onEdgesUpdate: (edges: WorkflowEdge[]) => void;
  onWorkflowUpdate: (update: WorkflowEditorUpdate) => void;
  onStepsUpdate?: (steps: WorkflowStep[]) => void;
  onQuickInsert?: (step: WorkflowStep) => void;
  onDeleteStep?: (stepId: string) => void;
  onToggleStepDisabled?: (stepId: string) => void;
  onInsertOnEdge?: (edge: WorkflowEdge, entry: N8nCatalogIndexEntry) => void;
  onStepNodeTypeChange?: (stepId: string, n8nType: string, version: number) => void;
  onAddStep: (entry: N8nCatalogIndexEntry) => void;
  onAddSubNode?: (parentId: string, slot: string) => void;
  deployed: boolean;
  deployState: DeployState;
  runState: RunState;
  deployError: string;
  runError: string;
  allRequiredConfigured: boolean;
  resolving?: boolean;
  workflowDbId?: string;
  publishState?: PublishState;
  publishError?: string;
  onDeploy: () => void;
  onRun: () => void;
  onPublish?: (activate: boolean) => void;
  onClose: () => void;
  editorCoachContext?: WorkflowEditorCoachContext;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [pendingInsertEdge, setPendingInsertEdge] = useState<WorkflowEdge | null>(null);

  const requestClose = () => setVisible(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const progress = configProgress(workflow.steps, stepConfigs);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence onExitComplete={onClose}>
      {visible && (
        <motion.div
          key="workflow-deploy-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-[5vh_5vw]"
          onClick={requestClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden w-full h-full max-w-[1400px] max-h-[90dvh]"
            onClick={e => e.stopPropagation()}
          >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0 bg-white">
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900 text-lg truncate">{workflow.title}</h2>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              {!deployed && progress.total > 0 && (
                <span className="text-sm text-gray-500">
                  {resolving ? 'Nodes werden zugeordnet…' : `${progress.done}/${progress.total} Schritte bereit`}
                </span>
              )}
              {deployed && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-3 py-1 rounded-full">
                  <Check size={13} /> Deployed
                </span>
              )}
              <button
                type="button"
                onClick={requestClose}
                className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors"
                aria-label="Schließen"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          {/* Graph + config panel + chat */}
          <div className="flex-1 relative min-h-0 flex w-full">
            <WorkflowFlowCanvas
              steps={workflow.steps}
              edges={workflow.edges}
              interactive={!deployed}
              stepConfigs={stepConfigs}
              onStepClick={onStepClick}
              onStepsChange={onStepsUpdate}
              onEdgesChange={onEdgesUpdate}
              onDeleteStep={onDeleteStep}
              onToggleStepDisabled={onToggleStepDisabled}
              onEdgeInsert={!deployed ? (edge) => { setPendingInsertEdge(edge); setAddPickerOpen(true); } : undefined}
              onAddStepClick={!deployed ? () => { setPendingInsertEdge(null); setAddPickerOpen(true); } : undefined}
              onAddSubNode={!deployed ? onAddSubNode : undefined}
              selectedStepId={activeStep?.id}
              className="w-full pb-24"
            />

            <WorkflowEditorChat
              workflow={workflow}
              stepConfigs={stepConfigs}
              workflowDbId={workflowDbId}
              coachContext={editorCoachContext}
              onWorkflowUpdate={onWorkflowUpdate}
              disabled={resolving}
            />

            <AnimatePresence>
              {activeStep && !deployed && (
                <StepConfigPanel
                  key={activeStep.id}
                  step={activeStep}
                  isFirstStep={workflow.steps[0]?.id === activeStep.id}
                  existing={stepConfigs[activeStep.id]}
                  onSave={config => { onStepSave(activeStep.id, config); onStepPanelClose(); }}
                  onClose={onStepPanelClose}
                  onNodeTypeChange={onStepNodeTypeChange}
                  onDelete={onDeleteStep}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-6 py-4 border-t border-gray-200 shrink-0 bg-white">
            {!deployed ? (
              <button
                onClick={onDeploy}
                disabled={!allRequiredConfigured || deployState === 'deploying'}
                className="flex items-center gap-2 px-8 py-3 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
              >
                {deployState === 'deploying'
                  ? <><Loader2 size={16} className="animate-spin" /> Deploye…</>
                  : <><Rocket size={16} /> Jetzt deployen</>}
              </button>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                {onPublish && (
                  publishState === 'active' ? (
                    <button
                      type="button"
                      onClick={() => onPublish(false)}
                      disabled={publishState === 'publishing'}
                      className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                    >
                      <PowerOff size={16} /> Deaktivieren
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onPublish(true)}
                      disabled={publishState === 'publishing'}
                      className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                    >
                      {publishState === 'publishing'
                        ? <><Loader2 size={16} className="animate-spin" /> Live…</>
                        : <><Power size={16} /> Live schalten</>}
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={onRun}
                  disabled={runState === 'running'}
                  className="flex items-center gap-2 px-8 py-3 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {runState === 'running'
                    ? <><Loader2 size={16} className="animate-spin" /> Testet…</>
                    : runState === 'done'
                      ? <><Check size={16} /> Getestet</>
                      : <><Play size={16} /> Testen</>}
                </button>
              </div>
            )}

            {!deployed && !allRequiredConfigured && (
              <span className="text-sm text-gray-400">
                Klick auf Nodes mit rotem Rand (!) — Deploy erst wenn alle Schritte konfiguriert sind.
              </span>
            )}
            {deployState === 'error' && (
              <span className="inline-flex items-center gap-1 text-sm text-red-500"><AlertCircle size={14} /> {deployError}</span>
            )}
            {runState === 'error' && (
              <span className="inline-flex items-center gap-1 text-sm text-red-500"><AlertCircle size={14} /> {runError}</span>
            )}
            {publishState === 'error' && publishError && (
              <span className="inline-flex items-center gap-1 text-sm text-red-500"><AlertCircle size={14} /> {publishError}</span>
            )}
            {publishState === 'active' && (
              <span className="text-sm text-amber-700 font-medium">Produktion aktiv (MCP publish)</span>
            )}
          </div>
        </motion.div>

          <N8nNodePickerModal
            open={addPickerOpen}
            onClose={() => { setAddPickerOpen(false); setPendingInsertEdge(null); }}
            onSelect={entry => {
              if (pendingInsertEdge && onInsertOnEdge) onInsertOnEdge(pendingInsertEdge, entry);
              else onAddStep(entry);
              setPendingInsertEdge(null);
            }}
            onQuickInsert={onQuickInsert}
            title={pendingInsertEdge ? 'Schritt einfügen' : 'Was passiert als Nächstes?'}
            subtitle="Kategorie wählen, dann den passenden Schritt"
            filterMode={workflow.steps.length === 0 ? 'trigger-only' : 'no-trigger'}
            defaultCategory={workflow.steps.length === 0 ? 'trigger' : 'action'}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
