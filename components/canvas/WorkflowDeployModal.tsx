"use client";

/**
 * Phase 4: n8n workflow editor + deploy — ~90% viewport with margin, chat bar on canvas.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Loader2, Play, AlertCircle, Power, PowerOff, Plus, ArrowLeft } from 'lucide-react';
import { useMounted } from '@/lib/use-mounted';
import { Workflow, WorkflowStep, StepConfig } from '@/lib/types';
import WorkflowFlowCanvas from './WorkflowFlowCanvas';
import StepConfigPanel from './StepConfigPanel';
import WorkflowEditorChat, { type WorkflowEditorUpdate } from './WorkflowEditorChat';
import N8nNodePickerModal from './N8nNodePickerModal';
import { inputFieldsForStep, runForStep } from '@/lib/workflow-io';
import type { N8nCatalogIndexEntry } from '@/lib/n8n-catalog-types';
import type { WorkflowEdge } from '@/lib/types';
import type { WorkflowEditorCoachContext } from '@/lib/workflow-editor-context';

type DeployState = 'idle' | 'deploying' | 'done' | 'error';
type RunState = 'idle' | 'running' | 'done' | 'error';
export type NodeRun = { node: string; status: 'success' | 'error'; error?: string; json: unknown[]; itemCount: number };
type PublishState = 'inactive' | 'active' | 'publishing' | 'error';

export default function WorkflowDeployModal({
  workflow,
  projectId,
  stepConfigs,
  activeStep,
  onStepClick,
  onStepSave,
  onStepPanelClose,
  onEdgesUpdate,
  onWorkflowUpdate,
  onStepsUpdate,
  onDeleteStep,
  onToggleStepDisabled,
  onInsertOnEdge,
  onStepNodeTypeChange,
  onAddStep,
  onAddSubNode,
  deployed,
  deployState,
  runState,
  runData = [],
  deployError,
  runError,
  resolving = false,
  workflowDbId,
  publishState = 'inactive',
  publishError = '',
  onRun,
  onPublish,
  onClose,
  editorCoachContext,
  variant = 'modal',
}: {
  workflow: Workflow;
  projectId?: string;
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
  runData?: NodeRun[];
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
  /** 'modal' = Portal-Overlay (Standard), 'page' = füllt den Container ohne Overlay (eigene Route). */
  variant?: 'modal' | 'page';
}) {
  const mounted = useMounted();
  const [visible, setVisible] = useState(true);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [pendingInsertEdge, setPendingInsertEdge] = useState<WorkflowEdge | null>(null);
  const [toast, setToast] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [animatedRunData, setAnimatedRunData] = useState<NodeRun[]>([]);
  const [playbackNode, setPlaybackNode] = useState<string | null>(null);

  const isPage = variant === 'page';
  // Im Modal: sanftes Ausblenden über AnimatePresence; auf der Seite: direkt schließen (Navigation).
  const requestClose = () => { if (isPage) onClose(); else setVisible(false); };

  useEffect(() => {
    if (isPage) return; // Page-Variante: kein body-scroll-lock — die Route bringt ihr eigenes Layout.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isPage]);

  // Animierte Wiedergabe des Testlaufs (pro Node 600ms). Alle State-Updates laufen im
  // Timer-Callback (asynchron) → kein synchrones setState im Effect-Body.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const kickoff = setTimeout(() => {
      if (runState === 'running' || deployState === 'deploying') {
        setAnimatedRunData([]);
        setPlaybackNode(null);
        return;
      }

      if (runData && runData.length > 0) {
        if (animatedRunData.length === runData.length && animatedRunData[0]?.node === runData[0]?.node) return;

        let i = 0;
        setAnimatedRunData([]);
        setPlaybackNode(runData[0].node);

        timer = setInterval(() => {
          setAnimatedRunData(prev => [...prev, runData[i]]);
          i++;
          if (i < runData.length) {
            setPlaybackNode(runData[i].node);
          } else {
            setPlaybackNode(null);
            if (timer) clearInterval(timer);
          }
        }, 600);
      } else {
        setAnimatedRunData([]);
        setPlaybackNode(null);
      }
    }, 0);
    return () => {
      clearTimeout(kickoff);
      if (timer) clearInterval(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runData, runState, deployState]);

  // Lauf-Status je Schritt (für Node-Badges) aus dem animierten Testlauf.
  const runStatusByStepId = useMemo(() => {
    const map: Record<string, 'success' | 'error' | 'running'> = {};
    for (const s of workflow.steps) {
      const run = runForStep(s, workflow.steps, animatedRunData);
      if (run?.status) map[s.id] = run.status;
      
      // Nutze n8nNameForStepIn Logik inline, da die NodeRun node-Eigenschaft dem n8n Namen entspricht.
      const stepIdx = workflow.steps.findIndex(x => x.id === s.id);
      const safeLabel = s.label.replace(/[^a-zA-Z0-9-]/g, '');
      const expectedName = `${safeLabel || 'Step'}${stepIdx > 0 ? stepIdx : ''}`;
      
      if (playbackNode === expectedName) {
         map[s.id] = 'running';
      }
    }
    return map;
  }, [workflow.steps, animatedRunData, playbackNode]);

  // Toast bei Fehler/Erfolg im Testlauf — beim Wechsel der runData direkt im Render
  // berechnen (statt im Effect), um die setState-in-effect-Kaskade zu vermeiden.
  const [syncedRunData, setSyncedRunData] = useState(runData);
  if (runData !== syncedRunData) {
    setSyncedRunData(runData);
    if (runData.length > 0) {
      const failed = runData.filter(r => r.status === 'error');
      setToast(
        failed.length > 0
          ? { kind: 'error', text: `Testlauf-Fehler in „${failed[0].node}": ${failed[0].error ?? 'siehe Node'}` }
          : { kind: 'success', text: 'Testlauf erfolgreich — alle Schritte durchgelaufen.' },
      );
    }
  }

  // Auto-Dismiss des Toasts (setState nur im Timer-Callback → kein Sync-setState im Effect).
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!mounted) return null;

  const cardClass = isPage
    ? 'flex flex-col bg-white overflow-hidden w-full h-full'
    : 'flex flex-col bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden w-full h-full max-w-[1400px] max-h-[90dvh]';

  const inner = (
    <>
      {/* Toast: Testlauf-Ergebnis */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="run-toast"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            onClick={e => { e.stopPropagation(); setToast(null); }}
            className={`fixed top-6 right-6 z-[10001] max-w-md flex items-start gap-2 rounded-xl px-4 py-3 shadow-2xl cursor-pointer ${
              toast.kind === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
            }`}
          >
            {toast.kind === 'error' ? <AlertCircle size={18} className="shrink-0 mt-0.5" /> : <Check size={18} className="shrink-0 mt-0.5" />}
            <span className="text-sm leading-snug">{toast.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: isPage ? 1 : 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: isPage ? 1 : 0.98 }}
        transition={{ duration: 0.2 }}
        className={cardClass}
        onClick={e => e.stopPropagation()}
      >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0 bg-white">
            <div className="flex items-center gap-3 min-w-0">
              {isPage && (
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 w-9 h-9 -ml-1 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors"
                  aria-label="Zurück zur Übersicht"
                  title="Zurück"
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <h2 className="font-bold text-gray-900 text-lg truncate">{workflow.title}</h2>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              {deployed && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-3 py-1 rounded-full">
                  <Check size={13} /> Deployed
                </span>
              )}

              {onPublish && (
                publishState === 'active' ? (
                  <button
                    type="button"
                    onClick={() => onPublish(false)}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  >
                    <PowerOff size={14} /> Deaktivieren
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onPublish(true)}
                    disabled={publishState === 'publishing' || deployState === 'deploying'}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    {publishState === 'publishing'
                      ? <><Loader2 size={14} className="animate-spin" /> Live…</>
                      : <><Power size={14} /> Live schalten</>}
                  </button>
                )
              )}
              <button
                type="button"
                onClick={onRun}
                disabled={runState === 'running' || deployState === 'deploying'}
                className="flex items-center gap-2 px-6 py-2 text-xs font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {runState === 'running'
                  ? <><Loader2 size={14} className="animate-spin" /> Testet…</>
                  : deployState === 'deploying'
                    ? <><Loader2 size={14} className="animate-spin" /> Deploye…</>
                    : <><Play size={14} /> Testen</>}
              </button>

              {deployState === 'error' && <span className="inline-flex items-center gap-1 text-xs text-red-500"><AlertCircle size={13} /> {deployError}</span>}
              {runState === 'error' && <span className="inline-flex items-center gap-1 text-xs text-red-500"><AlertCircle size={13} /> {runError}</span>}
              {publishState === 'error' && publishError && <span className="inline-flex items-center gap-1 text-xs text-red-500"><AlertCircle size={13} /> {publishError}</span>}

              {!isPage && (
                <button
                  type="button"
                  onClick={requestClose}
                  className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors ml-2"
                  aria-label="Schließen"
                >
                  <X size={20} />
                </button>
              )}
            </div>
          </div>

          {/* Graph + config panel + chat */}
          <div className="flex-1 relative min-h-0 flex w-full">
            <WorkflowFlowCanvas
              steps={workflow.steps}
              edges={workflow.edges}
              fitViewKey={workflow.id}
              interactive
              stepConfigs={stepConfigs}
              onStepClick={onStepClick}
              onStepsChange={onStepsUpdate}
              onEdgesChange={onEdgesUpdate}
              onDeleteStep={onDeleteStep}
              onToggleStepDisabled={onToggleStepDisabled}
              onAddStepClick={(stepId, branch) => { 
                if (stepId) setPendingInsertEdge({ id: '', source: stepId, target: '', branch: branch || 'default' });
                else setPendingInsertEdge(null);
                setAddPickerOpen(true); 
              }}
              onEdgeInsert={(edge) => { setPendingInsertEdge(edge); setAddPickerOpen(true); }}
              onAddSubNode={onAddSubNode}
              onRun={onRun}
              runStatusByStepId={runStatusByStepId}
              selectedStepId={activeStep?.id}
              className="w-full"
            />

            {/* Globaler "Neuer Schritt" Button — auch nach Deploy/Testen sichtbar (Workflow bleibt editierbar). */}
            <button
              onClick={() => { setPendingInsertEdge(null); setAddPickerOpen(true); }}
              className="absolute bottom-6 right-6 z-10 flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-3 font-semibold text-white shadow-lg hover:bg-indigo-700 hover:shadow-xl transition-all"
            >
              <Plus size={20} /> Neuer Schritt
            </button>

            <WorkflowEditorChat
              workflow={workflow}
              stepConfigs={stepConfigs}
              workflowDbId={workflowDbId}
              coachContext={editorCoachContext}
              runData={runData}
              runError={runState === 'error' ? runError : ''}
              onWorkflowUpdate={onWorkflowUpdate}
              disabled={resolving}
            />

            <AnimatePresence>
              {activeStep && (
                <StepConfigPanel
                  key={activeStep.id}
                  step={activeStep}
                  projectId={projectId}
                  isFirstStep={workflow.steps[0]?.id === activeStep.id}
                  existing={stepConfigs[activeStep.id]}
                  inputFields={inputFieldsForStep(activeStep, workflow.steps, workflow.edges ?? [], runData)}
                  inputRun={runForStep(activeStep, workflow.steps, runData)}
                  onSave={config => onStepSave(activeStep.id, config)}
                  onClose={onStepPanelClose}
                  onNodeTypeChange={onStepNodeTypeChange}
                  onDelete={onDeleteStep}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Test-Ergebnisse je Schritt (wie n8n: Output je Node) */}
          {animatedRunData.length > 0 && (
            <div className="shrink-0 max-h-[34%] overflow-y-auto border-t border-gray-200 bg-gray-50 px-6 py-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                Testlauf — Daten je Schritt
              </div>
              <div className="space-y-2">
                {animatedRunData.map((r, i) => (
                  <details key={`${r.node}-${i}`} className="rounded-lg border border-gray-200 bg-white">
                    <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm">
                      {r.status === 'error'
                        ? <AlertCircle size={14} className="text-red-500 shrink-0" />
                        : <Check size={14} className="text-green-600 shrink-0" />}
                      <span className="font-medium text-gray-800 truncate">{r.node}</span>
                      <span className="text-xs text-gray-400 ml-auto shrink-0">
                        {r.status === 'error' ? 'Fehler' : `${r.itemCount} Item${r.itemCount === 1 ? '' : 's'}`}
                      </span>
                    </summary>
                    <div className="px-3 pb-3">
                      {r.error && <p className="text-xs text-red-500 mb-2">{r.error}</p>}
                      <pre className="text-[11px] leading-snug bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto max-h-48">
                        {JSON.stringify(r.json?.slice(0, 5) ?? [], null, 2)}
                      </pre>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* Footer removed */}
      </motion.div>

      <N8nNodePickerModal
        open={addPickerOpen}
        onClose={() => { setAddPickerOpen(false); setPendingInsertEdge(null); }}
        onSelect={(entry) => {
          if (pendingInsertEdge) {
            onInsertOnEdge?.(pendingInsertEdge, entry);
          } else {
            onAddStep(entry);
          }
          setAddPickerOpen(false);
          setPendingInsertEdge(null);
        }}
        title={pendingInsertEdge ? 'Schritt anfügen' : 'Neuen Schritt hinzufügen'}
        filterMode={
          workflow.steps.length === 0
            ? 'trigger-only'
            : pendingInsertEdge ? 'no-trigger' : 'all'
        }
        defaultCategory={workflow.steps.length === 0 ? 'trigger' : undefined}
      />
    </>
  );

  // Page-Variante: füllt den Container der Route (kein Portal/Overlay).
  if (isPage) {
    return <div className="relative flex h-full w-full flex-col bg-white">{inner}</div>;
  }

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
          {inner}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
