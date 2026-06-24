"use client";

/**
 * React Flow workflow canvas — Branches, Drag (persistiert), Verbinden,
 * Edge-Hover mit Einfügen/Löschen, Node-Hover-Toolbar.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type OnConnect,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, X } from 'lucide-react';
import type { StepConfig, WorkflowEdge, WorkflowStep } from '@/lib/types';
import { isConfigured, requiresConfig } from '@/lib/workflow-deploy';
import { isAiConnection } from '@/lib/ai-subnodes';
import {
  ADD_STEP_NODE_PREFIX,
  aiConnectionFromHandles,
  branchToSourceHandle,
  connectionToEdgeFields,
  findTerminalBranches,
  flowNodeColumnWidth,
  layoutStepPositions,
  parseSwitchBranch,
  resolveWorkflowEdges,
} from '@/lib/workflow-graph';
import WorkflowFlowNode, { type FlowNodeData } from './WorkflowFlowNode';
import WorkflowAddStepNode, { ADD_STEP_BTN_SIZE, type AddStepNodeData } from './WorkflowAddStepNode';
import type { N8nNodeState } from './N8nNode';

type FlowEdgeData = {
  label?: string;
  interactive?: boolean;
  onInsert?: () => void;
  onDelete?: () => void;
};

/** Edge mit Hover-Buttons (Einfügen / Verbindung löschen) — n8n-Stil. */
function WorkflowFlowEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd,
}: EdgeProps & { data?: FlowEdgeData }) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });
  const d = data as FlowEdgeData | undefined;
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: '#b0b0bc', strokeWidth: 2 }} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan group absolute"
          style={{ transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all' }}
        >
          {d?.label && (
            <span className="rounded bg-white/90 px-1 text-[10px] text-gray-500 group-hover:opacity-0">{d.label}</span>
          )}
          {d?.interactive && (
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                title="Schritt einfügen"
                onClick={(e) => { e.stopPropagation(); d.onInsert?.(); }}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-indigo-600 shadow hover:bg-indigo-50"
              >
                <Plus size={13} />
              </button>
              <button
                type="button"
                title="Verbindung löschen"
                onClick={(e) => { e.stopPropagation(); d.onDelete?.(); }}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow hover:bg-red-50 hover:text-red-600"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { workflowStep: WorkflowFlowNode, addStep: WorkflowAddStepNode };
const edgeTypes = { workflowEdge: WorkflowFlowEdge };

/** Gleiche Logik wie der Fit-View-Button in den Controls. */
const FIT_VIEW_OPTS = { padding: 0.12, duration: 250 };
const ICON_SIZE = 76;

function iconRightX(colW: number): number {
  return (colW - ICON_SIZE) / 2 + ICON_SIZE;
}

function nodeState(step: WorkflowStep, stepConfigs?: Record<string, StepConfig>): N8nNodeState {
  if (!stepConfigs) return 'default';
  if (isConfigured(step, stepConfigs[step.id])) return 'configured';
  if (requiresConfig(step)) return 'needsCredential';
  return 'default';
}

function toFlowNodes(
  steps: WorkflowStep[],
  stepConfigs: Record<string, StepConfig> | undefined,
  selectedStepId: string | null | undefined,
  interactive: boolean,
  onStepClick?: (step: WorkflowStep) => void,
  onDeleteStep?: (stepId: string) => void,
  onToggleStepDisabled?: (stepId: string) => void,
  onAddSubNode?: (stepId: string, slot: string) => void,
  onRun?: () => void,
  runStatusByStepId?: Record<string, 'success' | 'error' | 'running'>,
): Node<FlowNodeData>[] {
  return steps.map(step => ({
    id: step.id,
    type: 'workflowStep',
    position: step.position ?? { x: 0, y: 0 },
    data: {
      step,
      state: selectedStepId === step.id ? 'selected' : nodeState(step, stepConfigs),
      interactive,
      runStatus: runStatusByStepId?.[step.id],
      onClick: onStepClick ? () => onStepClick(step) : undefined,
      onDelete: interactive && onDeleteStep ? () => onDeleteStep(step.id) : undefined,
      onToggleDisabled: interactive && onToggleStepDisabled ? () => onToggleStepDisabled(step.id) : undefined,
      onAddSubNode: interactive && onAddSubNode ? (slot: string) => onAddSubNode(step.id, slot) : undefined,
      onRun,
    },
  }));
}

function fromFlowConnection(connection: Connection, steps: WorkflowStep[]): WorkflowEdge | null {
  if (!connection.source || !connection.target) return null;

  const aiType = aiConnectionFromHandles(connection.sourceHandle, connection.targetHandle);
  if (aiType && isAiConnection(aiType)) {
    return {
      id: `e-ai-${connection.source}-${connection.target}-${aiType}`,
      source: connection.source,
      target: connection.target,
      connectionType: aiType,
    };
  }

  const sourceStep = steps.find(s => s.id === connection.source);
  const { branch, targetInput } = connectionToEdgeFields(
    connection.sourceHandle,
    connection.targetHandle,
    sourceStep,
  );
  return {
    id: `e-${connection.source}-${connection.target}-${branch}${targetInput != null ? `-in${targetInput}` : ''}`,
    source: connection.source,
    target: connection.target,
    branch,
    targetInput,
  };
}

export default function WorkflowFlowCanvas({
  steps,
  edges,
  stepConfigs,
  interactive = false,
  selectedStepId,
  fitViewKey,
  onStepClick,
  onStepsChange,
  onEdgesChange,
  onAddStepClick,
  onDeleteStep,
  onToggleStepDisabled,
  onEdgeInsert,
  onAddSubNode,
  onRun,
  runStatusByStepId,
  className = '',
}: {
  steps: WorkflowStep[];
  edges?: WorkflowEdge[];
  stepConfigs?: Record<string, StepConfig>;
  interactive?: boolean;
  selectedStepId?: string | null;
  /** Wechsel triggert Fit-View (z. B. workflow.id beim Öffnen). */
  fitViewKey?: string;
  onStepClick?: (step: WorkflowStep) => void;
  onStepsChange?: (steps: WorkflowStep[]) => void;
  onEdgesChange?: (edges: WorkflowEdge[]) => void;
  onAddStepClick?: (stepId?: string, branch?: string) => void;
  onDeleteStep?: (stepId: string) => void;
  onToggleStepDisabled?: (stepId: string) => void;
  onEdgeInsert?: (edge: WorkflowEdge) => void;
  onAddSubNode?: (stepId: string, slot: string) => void;
  onRun?: () => void;
  runStatusByStepId?: Record<string, 'success' | 'error' | 'running'>;
  className?: string;
}) {
  const resolvedEdges = useMemo(
    () => resolveWorkflowEdges(steps, edges),
    [steps, edges],
  );

  const laidOutSteps = useMemo(
    () => layoutStepPositions(steps, resolvedEdges),
    [steps, resolvedEdges],
  );

  const terminalBranches = useMemo(
    () => findTerminalBranches(laidOutSteps, resolvedEdges),
    [laidOutSteps, resolvedEdges],
  );

  const addConnectorNodes = useMemo((): Node<AddStepNodeData>[] => {
    if (!interactive || !onAddStepClick) return [];
    return terminalBranches.flatMap(({ stepId, branch }) => {
      const step = laidOutSteps.find(s => s.id === stepId);
      if (!step?.position) return [];
      const colW = flowNodeColumnWidth(step);
      
      let yPct = 50;
      if (branch === 'true') yPct = 35;
      else if (branch === 'false') yPct = 65;
      else if (branch.startsWith('switch-')) {
        const count = (step.parameters?.outputCount as number) || 1;
        const i = parseInt(branch.slice(7), 10);
        yPct = count === 1 ? 50 : 15 + (i / (count - 1)) * 70;
      }
      const yOffset = 130 * yPct / 100;

      return [{
        id: `${ADD_STEP_NODE_PREFIX}${stepId}-${branch}`,
        type: 'addStep',
        position: {
          x: step.position.x + iconRightX(colW) + 32,
          y: step.position.y + yOffset - ADD_STEP_BTN_SIZE / 2,
        },
        data: { onClick: () => onAddStepClick(stepId, branch) },
        draggable: false,
        selectable: false,
        connectable: false,
      }];
    });
  }, [interactive, onAddStepClick, terminalBranches, laidOutSteps]);

  const derivedFlowNodes = useMemo(
    () => [
      ...toFlowNodes(
        laidOutSteps,
        stepConfigs,
        selectedStepId,
        interactive,
        onStepClick,
        onDeleteStep,
        onToggleStepDisabled,
        onAddSubNode,
        onRun,
        runStatusByStepId,
      ),
      ...addConnectorNodes,
    ],
    [laidOutSteps, stepConfigs, selectedStepId, interactive, onStepClick, onDeleteStep, onToggleStepDisabled, onAddSubNode, onRun, runStatusByStepId, addConnectorNodes],
  );

  const [flowNodes, setFlowNodes, onFlowNodesChange] = useNodesState(derivedFlowNodes);
  /** true while user has a node pressed — set by onNodeDragStart, cleared by onNodeDragStop */
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (isDraggingRef.current) {
      // Während Drag: Metadaten syncen, Positionen vom laufenden Drag behalten.
      setFlowNodes(nds => nds.map(n => {
        const derived = derivedFlowNodes.find(d => d.id === n.id);
        return derived ? { ...derived, position: n.position } : n;
      }));
      return;
    }
    setFlowNodes(derivedFlowNodes);
  }, [derivedFlowNodes, setFlowNodes]);

  const handleEdgeDelete = useCallback((edgeId: string) => {
    if (!onEdgesChange) return;
    onEdgesChange(resolvedEdges.filter(e => e.id !== edgeId));
  }, [onEdgesChange, resolvedEdges]);

  const connectorEdges = useMemo<Edge[]>(() => {
    if (!interactive || !onAddStepClick) return [];
    return terminalBranches.map(({ stepId, branch }) => ({
      id: `${ADD_STEP_NODE_PREFIX}edge-${stepId}-${branch}`,
      source: stepId,
      sourceHandle: branchToSourceHandle(branch),
      target: `${ADD_STEP_NODE_PREFIX}${stepId}-${branch}`,
      style: { stroke: '#b0b0bc', strokeWidth: 2 },
      selectable: false,
      interactionWidth: 0,
    }));
  }, [interactive, onAddStepClick, terminalBranches]);

  const flowEdges = useMemo<Edge[]>(() => [
    ...resolvedEdges.map(e => {
    // AI-Sub-Connection (Chat Model/Memory/Tool → Agent): gestrichelt violett, ohne +/×.
    if (e.connectionType) {
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: 'ai_out',
        targetHandle: e.connectionType,
        style: { stroke: '#a78bfa', strokeWidth: 2, strokeDasharray: '5 4' },
        animated: true,
      };
    }

    const sw = parseSwitchBranch(e.branch);
    let label: string | undefined;
    if (e.branch === 'true') label = 'Ja';
    else if (e.branch === 'false') label = 'Nein';
    else if (sw != null) label = sw === 0 ? '0' : String(sw);

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'workflowEdge',
      sourceHandle: branchToSourceHandle(e.branch),
      targetHandle: e.targetInput != null ? `input-${e.targetInput}` : undefined,
      data: {
        label,
        interactive,
        onInsert: onEdgeInsert ? () => onEdgeInsert(e) : undefined,
        onDelete: () => handleEdgeDelete(e.id),
      } satisfies FlowEdgeData,
    };
  }),
    ...connectorEdges,
  ], [resolvedEdges, interactive, onEdgeInsert, handleEdgeDelete, connectorEdges]);

  const flowRef = useRef<ReactFlowInstance<Node<FlowNodeData | AddStepNodeData>, Edge> | null>(null);
  const lastFitKeyRef = useRef('');

  const scheduleFitView = useCallback((key: string) => {
    if (lastFitKeyRef.current === key) return;
    lastFitKeyRef.current = key;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        flowRef.current?.fitView(FIT_VIEW_OPTS);
      });
    });
  }, []);

  const onInit = useCallback((instance: ReactFlowInstance<Node<FlowNodeData | AddStepNodeData>, Edge>) => {
    flowRef.current = instance;
    scheduleFitView(`init-${fitViewKey ?? steps.length}`);
  }, [fitViewKey, steps.length, scheduleFitView]);

  useEffect(() => {
    if (!fitViewKey) return;
    lastFitKeyRef.current = '';
    scheduleFitView(`open-${fitViewKey}`);
  }, [fitViewKey, scheduleFitView]);

  const onConnect: OnConnect = useCallback((connection: Connection) => {
    if (!interactive || !onEdgesChange) return;
    const newEdge = fromFlowConnection(connection, steps);
    if (!newEdge) return;

    let next = resolvedEdges;
    if (newEdge.connectionType) {
      // Pro Parent-Slot nur eine Verbindung (Chat Model/Memory); Tools dürfen mehrfach.
      next = resolvedEdges.filter(
        e => !(e.connectionType === newEdge.connectionType && e.target === newEdge.target
          && newEdge.connectionType !== 'ai_tool'),
      );
    } else {
      next = resolvedEdges.filter(
        e => !(e.source === newEdge.source && e.branch === newEdge.branch && !e.connectionType),
      );
    }
    onEdgesChange([...next, newEdge]);
  }, [interactive, onEdgesChange, steps, resolvedEdges]);

  // onNodesChange: only forwards React Flow's internal state changes.
  // Position persistence is handled by onNodeDragStop below.
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    onFlowNodesChange(changes);
  }, [onFlowNodesChange]);

  // Called ONLY on real user drag-end — safe to persist positions.
  const onNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const onNodeDragStop = useCallback((_: MouseEvent | TouchEvent, node: Node) => {
    isDraggingRef.current = false;
    if (!interactive || !onStepsChange) return;
    if (String(node.id).startsWith(ADD_STEP_NODE_PREFIX)) return;
    // Persist the dragged node's final position.
    const next = steps.map(s =>
      s.id === node.id ? { ...s, position: { x: node.position.x, y: node.position.y } } : s,
    );
    onStepsChange(next);
  }, [interactive, onStepsChange, steps]);

  return (
    <div className={`workflow-flow-editor relative flex-1 min-h-0 ${className}`}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, node) => {
          if (node.type === 'addStep') return;
          const step = (node.data as FlowNodeData).step;
          onStepClick?.(step);
        }}
        onConnect={onConnect}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        nodesDraggable={interactive}
        nodesConnectable={interactive}
        elementsSelectable={interactive}
        deleteKeyCode={interactive ? ['Backspace', 'Delete'] : null}
        panOnScroll
        onInit={onInit}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="#c8c8d4" />
        <Controls
          showInteractive={false}
          position="bottom-left"
          className="workflow-flow-controls"
        />
      </ReactFlow>
    </div>
  );
}
