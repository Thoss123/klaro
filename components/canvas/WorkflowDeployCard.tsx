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
import { buildParameters, configProgress, credentialToolName, isConfigured, requiresConfig } from '@/lib/workflow-deploy';
import type { StepMapping } from '@/lib/workflow-generator';
import type { N8nCatalogIndexEntry } from '@/lib/n8n-catalog-types';
import { stepTypeFromCatalogEntry } from '@/lib/n8n-categories';
import { attachSubNode, subNodeLabel, syncAiGraphMeta } from '@/lib/ai-subnodes';
import { defaultLinearEdges, insertStepInGraph, removeStepFromGraph, withTriggerFirst } from '@/lib/workflow-graph';
import N8nNodePickerModal from './N8nNodePickerModal';
import { shortLabel } from '@/lib/short-label';
import WorkflowDeployModal from './WorkflowDeployModal';
import type { WorkflowEditorUpdate } from './WorkflowEditorChat';
import type { WorkflowEditorCoachContext } from '@/lib/workflow-editor-context';

type DeployState = 'idle' | 'deploying' | 'done' | 'error';
type RunState = 'idle' | 'running' | 'done' | 'error';
type PublishState = 'inactive' | 'active' | 'publishing' | 'error';

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
  editorCoachContext,
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
  editorCoachContext?: WorkflowEditorCoachContext;
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
  const [publishState, setPublishState] = useState<PublishState>('inactive');
  const [publishError, setPublishError] = useState('');

  const displayWorkflow: Workflow = { ...workflow, steps, edges };
  const deployed = deployState === 'done';

  // Beim Wechsel auf einen anderen Workflow lokalen Zustand neu aus den Props laden.
  const lastWorkflowIdRef = useRef(workflow.id);
  useEffect(() => {
    if (lastWorkflowIdRef.current !== workflow.id) {
      lastWorkflowIdRef.current = workflow.id;
    }
    setSteps(workflow.steps);
    setEdges(workflow.edges ?? defaultLinearEdges(workflow.steps));
  }, [workflow.id, workflow.steps, workflow.edges]);

  useEffect(() => {
    if (autoOpen && !modalOpen) {
      setModalOpen(true);
      onAutoOpen?.();
    }
  }, [autoOpen, modalOpen, onAutoOpen]);

  /** Einzige Schreibstelle für den Graph: Trigger garantiert verbunden + ins Canvas persistieren. */
  const applyGraph = useCallback((nextSteps: WorkflowStep[], nextEdges: WorkflowEdge[]) => {
    const synced = syncAiGraphMeta(nextSteps, nextEdges);
    const wired = withTriggerFirst(synced, nextEdges);
    setSteps(wired.steps);
    setEdges(wired.edges);
    if (activeStep) {
      const fresh = wired.steps.find(s => s.id === activeStep.id);
      if (fresh) setActiveStep(fresh);
    }
    onWorkflowPersist?.({ ...workflow, steps: wired.steps, edges: wired.edges });
  }, [workflow, onWorkflowPersist, activeStep]);

  const handleWorkflowUpdate = useCallback((update: WorkflowEditorUpdate) => {
    applyGraph(update.steps, update.edges);

    if (update.stepConfigUpdates) {
      for (const [stepId, partial] of Object.entries(update.stepConfigUpdates)) {
        const prev = stepConfigs[stepId];
        onStepConfigSave(stepId, {
          configType: 'n8n',
          ...prev,
          ...partial,
          n8nType: partial.n8nType ?? prev?.n8nType,
          n8nTypeVersion: partial.n8nTypeVersion ?? prev?.n8nTypeVersion,
          parameters: { ...prev?.parameters, ...partial.parameters },
          credentialType: partial.credentialType ?? prev?.credentialType,
        });
      }
    }

    if (update.openStepId) {
      const step = update.steps.find(s => s.id === update.openStepId);
      if (step) setActiveStep(step);
    }
  }, [applyGraph, stepConfigs, onStepConfigSave]);

  const handleEdgesUpdate = useCallback((nextEdges: WorkflowEdge[]) => {
    applyGraph(steps, nextEdges);
  }, [applyGraph, steps]);

  const handleStepsUpdate = useCallback((nextSteps: WorkflowStep[]) => {
    applyGraph(nextSteps, edges);
  }, [applyGraph, edges]);

  const handleQuickInsert = useCallback((newStep: WorkflowStep) => {
    const afterId = steps[steps.length - 1]?.id;
    const res = insertStepInGraph(steps, edges, { ...newStep, label: shortLabel(newStep.label, { n8nType: newStep.n8nType }) }, { afterStepId: afterId });
    applyGraph(res.steps, res.edges);
    setActiveStep(newStep);
  }, [applyGraph, steps, edges]);

  const handleAddStep = useCallback((entry: N8nCatalogIndexEntry) => {
    const newStep: WorkflowStep = {
      id: `step-${Date.now()}`,
      label: shortLabel(entry.displayName, { n8nType: entry.name }),
      type: stepTypeFromCatalogEntry(entry),
      n8nType: entry.name,
      n8nTypeVersion: entry.version,
      tool: entry.name.split('.').pop(),
      credentialType: entry.credentialTypes[0],
    };
    const afterId = steps[steps.length - 1]?.id;
    const res = insertStepInGraph(steps, edges, newStep, { afterStepId: afterId });
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

  const buildMappings = (): StepMapping[] =>
    steps.map(step => {
      const config = stepConfigs[step.id];
      const n8nType = config?.n8nType || step.n8nType;
      const parameters = buildParameters(step, config);
      return {
        step_id: step.id,
        n8n_type: n8nType,
        type_version: config?.n8nTypeVersion ?? step.n8nTypeVersion,
        credential_type: config?.credentialType || step.credentialType,
        tool: n8nType?.split('.').pop(),
        ...(parameters ? { parameters } : {}),
      };
    });

  const syncToN8n = async (opts: {
    structureChanged?: boolean;
    changedStepIds?: string[];
  } = {}) => {
    if (!deployedWorkflowId) return;
    await fetch('/api/n8n/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_db_id: deployedWorkflowId,
        workflow: displayWorkflow,
        step_configs: stepConfigs,
        workflow_name: workflow.title,
        structure_changed: opts.structureChanged ?? false,
        changed_step_ids: opts.changedStepIds,
      }),
    });
  };

  const handleStepConfigSaveWithSync = (stepId: string, config: StepConfig) => {
    onStepConfigSave(stepId, config);
    if (deployedWorkflowId) {
      syncToN8n({ changedStepIds: [stepId] }).catch(console.error);
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
          step_configs: stepConfigs,
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
            step_configs: stepConfigs,
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
          step_configs: stepConfigs,
          name: workflow.title,
          linked_use_case: workflow.linked_pain_point,
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

  const handlePublish = async (activate: boolean) => {
    const wfId = deployedWorkflowId;
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
    const wfId = deployedWorkflowId;
    if (!wfId) return;
    setRunState('running');
    setRunError('');
    try {
      const res = await fetch('/api/n8n/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: wfId }),
      });
      const data = await res.json();
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
            stepConfigs={stepConfigs}
            activeStep={activeStep}
            onStepClick={step => !deployed && setActiveStep(step)}
            onStepSave={handleStepConfigSaveWithSync}
            workflowDbId={deployedWorkflowId}
            onStepPanelClose={() => setActiveStep(null)}
            onEdgesUpdate={handleEdgesUpdate}
            onWorkflowUpdate={handleWorkflowUpdate}
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
            deployError={deployError}
            runError={runError}
            allRequiredConfigured={allRequiredConfigured}
            publishState={publishState}
            publishError={publishError}
            onDeploy={handleDeploy}
            onRun={handleRun}
            onPublish={handlePublish}
            onClose={() => { setModalOpen(false); setActiveStep(null); }}
            editorCoachContext={editorCoachContext}
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
