"use client";

/**
 * Phase 4: compact canvas card — preview only; all deploy UX in fullscreen modal.
 * Nodes sind bereits beim Build (Server) aufgelöst & verbunden — der Client löst NICHT neu auf,
 * er zeigt nur an und persistiert Bearbeitungen (Drag, Add/Delete, Node-Typ) ins Canvas.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Rocket, Maximize2 } from 'lucide-react';
import { Workflow, WorkflowStep, StepConfig, WorkflowEdge } from '@/lib/types';
import { buildParameters, configProgress, credentialToolName, isConfigured, mappingToolForStep, requiresConfig } from '@/lib/workflow-deploy';
import type { StepMapping } from '@/lib/workflow-generator';
import type { N8nCatalogIndexEntry } from '@/lib/n8n-catalog-types';
import { stepTypeFromCatalogEntry } from '@/lib/n8n-categories';
import { attachSubNode, subNodeLabel, syncAiGraphMeta } from '@/lib/ai-subnodes';
import { defaultLinearEdges, insertStepInGraph, removeStepFromGraph, withTriggerFirst } from '@/lib/workflow-graph';
import N8nNodePickerModal from './N8nNodePickerModal';
import { shortLabel } from '@/lib/short-label';
import WorkflowDeployModal from './WorkflowDeployModal';

type DeployState = 'idle' | 'deploying' | 'done' | 'error';
type RunState = 'idle' | 'running' | 'done' | 'error';
export type NodeRun = { node: string; status: 'success' | 'error'; error?: string; json: unknown[]; itemCount: number };
type PublishState = 'inactive' | 'active' | 'publishing' | 'error';

/** Freie Position für einen losgelösten neuen Node — unter dem bestehenden Graphen. */
function freeCanvasPosition(steps: WorkflowStep[]): { x: number; y: number } {
  const positioned = steps.filter(s => s.position && !s.subNodeOf);
  if (!positioned.length) return { x: 80, y: 200 };
  const minX = Math.min(...positioned.map(s => s.position!.x));
  const maxY = Math.max(...positioned.map(s => s.position!.y));
  return { x: minX, y: maxY + 220 };
}

export default function WorkflowDeployCard({
  workflow,
  projectId,
  stepConfigs,
  onStepConfigSave,
  deployedWorkflowId,
  onDeployed,
  compact = false,
  linkedTitle,
  autoOpen = false,
  onAutoOpen,
  onWorkflowPersist,
  fullPage = false,
  onClose,
}: {
  workflow: Workflow;
  projectId: string;
  stepConfigs: Record<string, StepConfig>;
  onStepConfigSave: (stepId: string, config: StepConfig) => void;
  deployedWorkflowId?: string;
  onDeployed: (dbId: string) => void;
  compact?: boolean;
  linkedTitle?: string;
  autoOpen?: boolean;
  onAutoOpen?: () => void;
  /** Bearbeitungen am Graph ins Projekt-Canvas zurückschreiben. */
  onWorkflowPersist?: (workflow: Workflow) => void;
  /** Editor füllt die ganze Seite (eigene Route) statt Karte + Popup. */
  fullPage?: boolean;
  /** Nur im fullPage-Modus: Zurück-Navigation. */
  onClose?: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeStep, setActiveStep] = useState<WorkflowStep | null>(null);
  const [subNodePicker, setSubNodePicker] = useState<{ parentId: string; slot: string } | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>(workflow.steps);
  const [edges, setEdges] = useState<WorkflowEdge[]>(workflow.edges ?? defaultLinearEdges(workflow.steps));
  const [deployState, setDeployState] = useState<DeployState>(deployedWorkflowId ? 'done' : 'idle');
  const [deployError, setDeployError] = useState('');
  const [runState, setRunState] = useState<RunState>('idle');
  const [runError, setRunError] = useState('');
  const [runData, setRunData] = useState<NodeRun[]>([]);
  const [publishState, setPublishState] = useState<PublishState>('inactive');
  const [publishError, setPublishError] = useState('');
  /** Debounce-Timer für n8n-Sync — verhindert Sync-Storm bei schnellen Änderungen. */
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStepConfigsRef = useRef(stepConfigs);

  useEffect(() => {
    latestStepConfigsRef.current = stepConfigs;
  }, [stepConfigs]);

  const displayWorkflow: Workflow = { ...workflow, steps, edges };
  const deployed = deployState === 'done';

  // Beim Wechsel auf einen anderen Workflow lokalen Zustand neu aus den Props laden.
  // Nur auf workflow.id reagieren – NICHT auf workflow.steps/.edges, da applyGraph die Steps
  // bereits lokal setzt UND onWorkflowPersist aufruft, was steps-Prop mit neuer Referenz zurückgibt
  // und sonst eine Feedback-Schleife (applyGraph → persist → useEffect → setSteps → re-render → …) auslöst.
  const lastWorkflowIdRef = useRef(workflow.id);
  useEffect(() => {
    if (lastWorkflowIdRef.current === workflow.id) return; // Gleicher Workflow — kein Reset nötig
    lastWorkflowIdRef.current = workflow.id;
    setSteps(workflow.steps);
    setEdges(workflow.edges ?? defaultLinearEdges(workflow.steps));
  }, [workflow.id, workflow.steps, workflow.edges]);

  // Öffnet das Modal, wenn der externe autoOpen-Trigger gesetzt ist, und meldet das dem
  // Parent zurück (onAutoOpen). Da hier auch ein Parent-Callback läuft, ist das ein echter
  // Side-Effect — keine Render-Zeit-Ableitung möglich.
  useEffect(() => {
    if (autoOpen && !modalOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModalOpen(true);
      onAutoOpen?.();
    }
  }, [autoOpen, modalOpen, onAutoOpen]);

  // Ausstehenden Sync-Timer beim Unmount abbrechen.
  useEffect(() => () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); }, []);

  /**
   * Einzige Schreibstelle für den Graph: Trigger verbunden + ins Canvas persistieren + (wenn deployed) live nach n8n syncen.
   * skipSync=true für reine Positions-Drags (n8n kennt keine Canvas-Koordinaten → kein Sync nötig).
   */
  const applyGraph = useCallback((
    nextSteps: WorkflowStep[],
    nextEdges: WorkflowEdge[],
    { skipSync = false }: { skipSync?: boolean } = {},
  ) => {
    const synced = syncAiGraphMeta(nextSteps, nextEdges);
    const wired = withTriggerFirst(synced, nextEdges);
    setSteps(wired.steps);
    setEdges(wired.edges);
    if (activeStep) {
      const fresh = wired.steps.find(s => s.id === activeStep.id);
      if (fresh) setActiveStep(fresh);
    }
    const nextWf = { ...workflow, steps: wired.steps, edges: wired.edges };
    onWorkflowPersist?.(nextWf);
    // Nach Deploy: strukturelle Änderungen nach n8n spiegeln — debounced, nie für reine Drag-Positionen.
    if (deployedWorkflowId && !skipSync) {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => {
        fetch('/api/n8n/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflow_db_id: deployedWorkflowId,
            workflow: nextWf,
            step_configs: stepConfigs,
            workflow_name: workflow.title,
            structure_changed: true,
          }),
        }).catch(console.error);
      }, 800);
    }
  }, [workflow, onWorkflowPersist, activeStep, deployedWorkflowId, stepConfigs]);

  const handleEdgesUpdate = useCallback((nextEdges: WorkflowEdge[]) => {
    applyGraph(steps, nextEdges);
  }, [applyGraph, steps]);

  // Nur Positions-Drag — kein n8n-Sync, da n8n Canvas-Koordinaten nicht kennt.
  const handleStepsUpdate = useCallback((nextSteps: WorkflowStep[]) => {
    applyGraph(nextSteps, edges, { skipSync: true });
  }, [applyGraph, edges]);

  const handleQuickInsert = useCallback((newStep: WorkflowStep) => {
    const afterId = steps[steps.length - 1]?.id;
    const res = insertStepInGraph(steps, edges, { ...newStep, label: shortLabel(newStep.label, { n8nType: newStep.n8nType }) }, { afterStepId: afterId });
    applyGraph(res.steps, res.edges);
    setActiveStep(newStep);
  }, [applyGraph, steps, edges]);

  const handleAddStep = useCallback((entry: N8nCatalogIndexEntry) => {
    const type = stepTypeFromCatalogEntry(entry);
    const newStep: WorkflowStep = {
      id: `step-${Date.now()}`,
      label: shortLabel(entry.displayName, { n8nType: entry.name }),
      type,
      n8nType: entry.name,
      n8nTypeVersion: entry.version,
      tool: entry.name.split('.').pop(),
      credentialType: entry.credentialTypes[0],
      // Detached: irgendwo wo Platz ist (unter dem bestehenden Graphen). Verbinden per Drag.
      position: freeCanvasPosition(steps),
    };
    // Kein afterStepId → der neue Node bleibt unverbunden (n8n-Stil: erst platzieren, dann verbinden).
    const res = insertStepInGraph(steps, edges, newStep);
    applyGraph(res.steps, res.edges);
    setActiveStep(newStep);
  }, [applyGraph, steps, edges]);

  const handleDeleteStep = useCallback((stepId: string) => {
    const res = removeStepFromGraph(steps, edges, stepId);
    if (activeStep?.id === stepId) setActiveStep(null);
    applyGraph(res.steps, res.edges);
  }, [applyGraph, steps, edges, activeStep?.id]);

  const handleToggleStepDisabled = useCallback((stepId: string) => {
    const nextSteps = steps.map(s => (s.id === stepId ? { ...s, disabled: !s.disabled } : s));
    applyGraph(nextSteps, edges);
  }, [applyGraph, steps, edges]);

  const handleInsertOnEdge = useCallback((edge: WorkflowEdge, entry: N8nCatalogIndexEntry) => {
    const newStep: WorkflowStep = {
      id: `step-${Date.now()}`,
      label: shortLabel(entry.displayName, { n8nType: entry.name }),
      type: stepTypeFromCatalogEntry(entry),
      n8nType: entry.name,
      n8nTypeVersion: entry.version,
      tool: entry.name.split('.').pop(),
      credentialType: entry.credentialTypes[0],
    };
    const res = insertStepInGraph(steps, edges, newStep, { afterStepId: edge.source, branch: edge.branch });
    applyGraph(res.steps, res.edges);
    setActiveStep(newStep);
  }, [applyGraph, steps, edges]);

  const handleStepNodeTypeChange = useCallback((stepId: string, n8nType: string, version: number) => {
    const nextSteps = steps.map(s =>
      s.id === stepId
        ? { ...s, n8nType, n8nTypeVersion: version, tool: n8nType.split('.').pop(), label: shortLabel(s.label, { n8nType }) }
        : s,
    );
    applyGraph(nextSteps, edges);
  }, [applyGraph, steps, edges]);

  const handleAddSubNode = useCallback((parentId: string, slot: string) => {
    setSubNodePicker({ parentId, slot });
  }, []);

  const handleSubNodeSelect = useCallback((entry: N8nCatalogIndexEntry) => {
    if (!subNodePicker) return;
    const { steps: nextSteps, edges: nextEdges, subId } = attachSubNode(
      steps, edges, subNodePicker.parentId, subNodePicker.slot, entry,
    );
    applyGraph(nextSteps, nextEdges);
    const added = nextSteps.find(s => s.id === subId);
    if (added) setActiveStep(added);
    setSubNodePicker(null);
  }, [applyGraph, steps, edges, subNodePicker]);

  const progress = configProgress(steps, stepConfigs);
  const allRequiredConfigured = steps
    .filter(requiresConfig)
    .every(s => isConfigured(s, stepConfigs[s.id]));

  const buildMappings = (configs = latestStepConfigsRef.current): StepMapping[] =>
    steps.map(step => {
      const config = configs[step.id];
      const n8nType = config?.n8nType || step.n8nType;
      const parameters = buildParameters(step, config);
      return {
        step_id: step.id,
        n8n_type: n8nType,
        type_version: config?.n8nTypeVersion ?? step.n8nTypeVersion,
        credential_type: config?.credentialType || step.credentialType,
        tool: mappingToolForStep(step, n8nType),
        ...(parameters ? { parameters } : {}),
      };
    });

  const syncToN8n = async (opts: {
    structureChanged?: boolean;
    changedStepIds?: string[];
    forcedConfigs?: Record<string, StepConfig>;
  } = {}) => {
    if (!deployedWorkflowId) return;
    const configsToUse = opts.forcedConfigs || latestStepConfigsRef.current;
    await fetch('/api/n8n/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_db_id: deployedWorkflowId,
        workflow: displayWorkflow,
        step_configs: configsToUse,
        workflow_name: workflow.title,
        structure_changed: opts.structureChanged ?? false,
        changed_step_ids: opts.changedStepIds,
      }),
    });
  };

  const handleStepConfigSaveWithSync = (stepId: string, config: StepConfig) => {
    const oldConfig = latestStepConfigsRef.current[stepId];
    const credentialChanged = config.credentialType !== oldConfig?.credentialType || config.credentialValue !== oldConfig?.credentialValue;

    // Lokalen Zustand sofort speichern (UI), n8n-Sync aber debouncen —
    // beim Tippen feuert das pro Tastendruck, sonst ein Sync-Storm.
    onStepConfigSave(stepId, config);
    if (deployedWorkflowId) {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      // We manually build the projected config here to ensure the debounce callback has it,
      // because latestStepConfigsRef.current might not be updated yet when the timeout starts.
      const projectedConfigs = { ...latestStepConfigsRef.current, [stepId]: config };
      syncTimerRef.current = setTimeout(() => {
        syncToN8n({ 
          changedStepIds: [stepId], 
          forcedConfigs: projectedConfigs,
          structureChanged: credentialChanged 
        }).catch(console.error);
      }, 800);
    }
  };

  const handleDeploy = async () => {
    setDeployState('deploying');
    setDeployError('');
    try {
      const mappings = buildMappings();

      const validateRes = await fetch('/api/n8n/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow: displayWorkflow,
          step_configs: latestStepConfigsRef.current,
          workflow_db_id: deployedWorkflowId,
          mappings,
          workflow_name: workflow.title,
        }),
      });
      const validation = await validateRes.json();
      if (!validateRes.ok) {
        const first = validation.errors?.[0]?.message;
        throw new Error(first || validation.error || 'Validierung fehlgeschlagen');
      }

      for (const step of steps) {
        const config = stepConfigs[step.id];
        if (!config?.credentialValue?.trim()) continue;
        const toolName = credentialToolName(config, step);
        const res = await fetch('/api/n8n/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            tool_name: toolName,
            credential_type: config.credentialType || 'api_key',
            value: config.credentialValue,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || `Credential für ${toolName} fehlgeschlagen`);
      }

      if (deployedWorkflowId) {
        const res = await fetch('/api/n8n/workflows', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: deployedWorkflowId,
            action: 'update',
            workflow: displayWorkflow,
            step_configs: latestStepConfigsRef.current,
            mappings,
            name: workflow.title,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Update fehlgeschlagen');
        setDeployState('done');
        return;
      }

      const res = await fetch('/api/n8n/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          workflow: displayWorkflow,
          mappings,
          step_configs: latestStepConfigsRef.current,
          name: workflow.title,
          linked_use_case: workflow.linked_pain_point,
          canvas_workflow_id: workflow.id,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Deploy fehlgeschlagen');
      const { workflow: dbWf, mcpTest } = payload as {
        workflow: { id: string };
        mcpTest?: { status?: string; error?: string };
      };
      if (mcpTest?.status === 'error' && mcpTest.error) {
        console.warn('[deploy] MCP-Test:', mcpTest.error);
      }
      setDeployState('done');
      onDeployed(dbWf.id);
    } catch (e: unknown) {
      setDeployError(e instanceof Error ? e.message : 'Deploy fehlgeschlagen');
      setDeployState('error');
    }
  };

  /** Lazy-Deploy: stellt sicher, dass ein n8n-Workflow existiert (ohne Config-Block) und liefert die id.
   *  „Immer testbar" — fehlende Config wirft erst beim Testen einen Node-Fehler. */
  const ensureDeployed = async (): Promise<string | null> => {
    if (deployedWorkflowId) return deployedWorkflowId;
    setDeployState('deploying');
    setDeployError('');
    try {
      // vorhandene Credentials speichern (für den Testlauf), Fehler ignorieren
      for (const step of steps) {
        const config = stepConfigs[step.id];
        if (!config?.credentialValue?.trim()) continue;
        await fetch('/api/n8n/credentials', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: projectId, tool_name: credentialToolName(config, step), credential_type: config.credentialType || 'api_key', value: config.credentialValue }),
        }).catch(() => {});
      }
      const res = await fetch('/api/n8n/workflows', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId, workflow: displayWorkflow, mappings: buildMappings(),
          step_configs: latestStepConfigsRef.current, name: workflow.title, linked_use_case: workflow.linked_pain_point,
          canvas_workflow_id: workflow.id,
          skip_validate: true,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.workflow?.id) throw new Error(payload.error || 'Deploy fehlgeschlagen');
      setDeployState('done');
      onDeployed(payload.workflow.id);
      return payload.workflow.id as string;
    } catch (e: unknown) {
      setDeployError(e instanceof Error ? e.message : 'Deploy fehlgeschlagen');
      setDeployState('error');
      return null;
    }
  };

  const handlePublish = async (activate: boolean) => {
    const wfId = deployedWorkflowId ?? await ensureDeployed();
    if (!wfId) return;
    setPublishState('publishing');
    setPublishError('');
    try {
      const res = await fetch('/api/n8n/workflows', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: wfId, action: activate ? 'activate' : 'deactivate' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Live-Schalten fehlgeschlagen');
      setPublishState(activate ? 'active' : 'inactive');
    } catch (e: unknown) {
      setPublishError(e instanceof Error ? e.message : 'Live-Schalten fehlgeschlagen');
      setPublishState('error');
    }
  };

  const handleRun = async () => {
    setRunState('running');
    setRunError('');
    let wfId = deployedWorkflowId;
    if (wfId) {
      try {
        // Update workflow in n8n before running to apply latest stepConfigs
        await fetch('/api/n8n/workflows', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: wfId,
            action: 'update',
            workflow: displayWorkflow,
            step_configs: latestStepConfigsRef.current,
            mappings: buildMappings(),
            name: workflow.title,
          }),
        });
      } catch (e) {
        console.warn('Update vor dem Test fehlgeschlagen', e);
      }
    } else {
      wfId = (await ensureDeployed()) ?? undefined;
    }
    if (!wfId) { setRunState('error'); setRunError('Konnte nicht deployen'); return; }
    try {
      const res = await fetch('/api/n8n/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: wfId }),
      });
      const data = await res.json();
      if (Array.isArray(data.runData)) setRunData(data.runData as NodeRun[]);
      if (!res.ok) throw new Error(data.error || 'Ausführung fehlgeschlagen');
      if (data.ok === false) {
        throw new Error(data.error || `Test fehlgeschlagen (${data.status ?? 'unbekannt'})`);
      }
      setRunState('done');
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : 'Ausführung fehlgeschlagen');
      setRunState('error');
    }
  };

  if (fullPage) {
    return (
      <>
        <WorkflowDeployModal
          variant="page"
          workflow={displayWorkflow}
          projectId={projectId}
          stepConfigs={stepConfigs}
          activeStep={activeStep}
          onStepClick={step => setActiveStep(step)}
          onStepSave={handleStepConfigSaveWithSync}
          onStepPanelClose={() => setActiveStep(null)}
          onEdgesUpdate={handleEdgesUpdate}
          onStepsUpdate={handleStepsUpdate}
          onQuickInsert={handleQuickInsert}
          onDeleteStep={handleDeleteStep}
          onToggleStepDisabled={handleToggleStepDisabled}
          onInsertOnEdge={handleInsertOnEdge}
          onStepNodeTypeChange={handleStepNodeTypeChange}
          onAddStep={handleAddStep}
          onAddSubNode={handleAddSubNode}
          deployed={deployed}
          deployState={deployState}
          runState={runState}
          runData={runData}
          deployError={deployError}
          runError={runError}
          allRequiredConfigured={allRequiredConfigured}
          publishState={publishState}
          publishError={publishError}
          onDeploy={handleDeploy}
          onRun={handleRun}
          onPublish={handlePublish}
          onClose={() => onClose?.()}
        />
        <N8nNodePickerModal
          open={!!subNodePicker}
          onClose={() => setSubNodePicker(null)}
          onSelect={handleSubNodeSelect}
          title={subNodePicker ? `${subNodeLabel(subNodePicker.slot)} hinzufügen` : 'Sub-Node'}
          subtitle="Passenden Baustein für den KI-Agenten wählen"
          slotFilter={subNodePicker?.slot}
          filterMode="no-trigger"
          defaultCategory="ai"
        />
      </>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={`rounded-2xl border border-gray-200 bg-white shadow-md overflow-hidden pointer-events-auto ${
          compact ? 'w-full min-h-[148px]' : 'my-3 max-w-2xl'
        }`}
      >
        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <Rocket size={18} className="text-indigo-600" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
                  {workflow.title}
                </div>
                {(linkedTitle || workflow.linked_pain_point) && (
                  <div className="text-xs text-gray-400 truncate mt-1">
                    Löst: {linkedTitle || workflow.linked_pain_point}
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  {steps.length} {steps.length === 1 ? 'Schritt' : 'Schritte'}
                  {!deployed && progress.total > 0 && (
                    <span className="text-gray-400">
                      {' '}· {progress.done}/{progress.total} konfiguriert
                    </span>
                  )}
                </p>
              </div>
            </div>
            {deployed ? (
              <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
                <Check size={12} /> Live
              </span>
            ) : progress.total > 0 ? (
              <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                progress.done === progress.total ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'
              }`}>
                {progress.done}/{progress.total}
              </span>
            ) : null}
          </div>
        </div>

        <div className="px-5 py-4">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors w-full"
          >
            <Maximize2 size={16} /> Workflow öffnen
          </button>
        </div>
      </motion.div>

      {modalOpen && (
          <WorkflowDeployModal
            workflow={displayWorkflow}
            projectId={projectId}
            stepConfigs={stepConfigs}
            activeStep={activeStep}
            onStepClick={step => setActiveStep(step)}
            onStepSave={handleStepConfigSaveWithSync}
            onStepPanelClose={() => setActiveStep(null)}
            onEdgesUpdate={handleEdgesUpdate}
            onStepsUpdate={handleStepsUpdate}
            onQuickInsert={handleQuickInsert}
            onDeleteStep={handleDeleteStep}
            onToggleStepDisabled={handleToggleStepDisabled}
            onInsertOnEdge={handleInsertOnEdge}
            onStepNodeTypeChange={handleStepNodeTypeChange}
            onAddStep={handleAddStep}
            onAddSubNode={handleAddSubNode}
            deployed={deployed}
            deployState={deployState}
            runState={runState}
            runData={runData}
            deployError={deployError}
            runError={runError}
            allRequiredConfigured={allRequiredConfigured}
            publishState={publishState}
            publishError={publishError}
            onDeploy={handleDeploy}
            onRun={handleRun}
            onPublish={handlePublish}
            onClose={() => { setModalOpen(false); setActiveStep(null); }}
          />
        )}

      <N8nNodePickerModal
        open={!!subNodePicker}
        onClose={() => setSubNodePicker(null)}
        onSelect={handleSubNodeSelect}
        title={subNodePicker ? `${subNodeLabel(subNodePicker.slot)} hinzufügen` : 'Sub-Node'}
        subtitle="Passenden Baustein für den KI-Agenten wählen"
        slotFilter={subNodePicker?.slot}
        filterMode="no-trigger"
        defaultCategory="ai"
      />
    </>
  );
}
