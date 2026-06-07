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
  MiniMap,
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
  aiConnectionFromHandles,
  branchToSourceHandle,
  connectionToEdgeFields,
  layoutStepPositions,
  parseSwitchBranch,
  resolveWorkflowEdges,
} from '@/lib/workflow-graph';
import WorkflowFlowNode, { type FlowNodeData } from './WorkflowFlowNode';
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

const nodeTypes = { workflowStep: WorkflowFlowNode };
const edgeTypes = { workflowEdge: WorkflowFlowEdge };

/** Beim Öffnen nur moderat einzoomen — nicht den ganzen Viewport ausfüllen. */
const FIT_VIEW_OPTS = { padding: 0.38, maxZoom: 0.82, minZoom: 0.45, duration: 180 };

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
): Node<FlowNodeData>[] {
  return steps.map(step => ({
    id: step.id,
    type: 'workflowStep',
    position: step.position ?? { x: 0, y: 0 },
    data: {
      step,
      state: selectedStepId === step.id ? 'selected' : nodeState(step, stepConfigs),
      interactive,
      onClick: onStepClick ? () => onStepClick(step) : undefined,
      onDelete: interactive && onDeleteStep ? () => onDeleteStep(step.id) : undefined,
      onToggleDisabled: interactive && onToggleStepDisabled ? () => onToggleStepDisabled(step.id) : undefined,
      onAddSubNode: interactive && onAddSubNode ? (slot: string) => onAddSubNode(step.id, slot) : undefined,
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
  onStepClick,
  onStepsChange,
  onEdgesChange,
  onAddStepClick,
  onDeleteStep,
  onToggleStepDisabled,
  onEdgeInsert,
  onAddSubNode,
  className = '',
}: {
  steps: WorkflowStep[];
  edges?: WorkflowEdge[];
  stepConfigs?: Record<string, StepConfig>;
  interactive?: boolean;
  selectedStepId?: string | null;
  onStepClick?: (step: WorkflowStep) => void;
  onStepsChange?: (steps: WorkflowStep[]) => void;
  onEdgesChange?: (edges: WorkflowEdge[]) => void;
  onAddStepClick?: () => void;
  onDeleteStep?: (stepId: string) => void;
  onToggleStepDisabled?: (stepId: string) => void;
  onEdgeInsert?: (edge: WorkflowEdge) => void;
  onAddSubNode?: (stepId: string, slot: string) => void;
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

  const derivedFlowNodes = useMemo(
    () => toFlowNodes(
      laidOutSteps,
      stepConfigs,
      selectedStepId,
      interactive,
      onStepClick,
      onDeleteStep,
      onToggleStepDisabled,
      onAddSubNode,
    ),
    [laidOutSteps, stepConfigs, selectedStepId, interactive, onStepClick, onDeleteStep, onToggleStepDisabled, onAddSubNode],
  );

  const [flowNodes, setFlowNodes, onFlowNodesChange] = useNodesState(derivedFlowNodes);
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

  const flowEdges = useMemo<Edge[]>(() => resolvedEdges.map(e => {
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
  }), [resolvedEdges, interactive, onEdgeInsert, handleEdgeDelete]);

  const flowRef = useRef<ReactFlowInstance<Node<FlowNodeData>, Edge> | null>(null);
  const lastFitKeyRef = useRef('');

  const scheduleFitView = useCallback((key: string) => {
    if (lastFitKeyRef.current === key) return;
    lastFitKeyRef.current = key;
    requestAnimationFrame(() => {
      flowRef.current?.fitView(FIT_VIEW_OPTS);
    });
  }, []);

  const onInit = useCallback((instance: ReactFlowInstance<Node<FlowNodeData>, Edge>) => {
    flowRef.current = instance;
    scheduleFitView(`init-${steps.length}`);
  }, [steps.length, scheduleFitView]);

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

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    onFlowNodesChange(changes);

    if (!interactive || !onStepsChange) return;

    if (changes.some(c => c.type === 'position' && c.dragging === true)) {
      isDraggingRef.current = true;
      return;
    }

    const positionChanges = changes.filter(
      c => c.type === 'position' && c.position && c.dragging === false,
    );
    if (!positionChanges.length) return;

    isDraggingRef.current = false;
    const next = steps.map(s => {
      const ch = positionChanges.find(c => c.type === 'position' && c.id === s.id);
      if (ch && ch.type === 'position' && ch.position) {
        return { ...s, position: { x: ch.position.x, y: ch.position.y } };
      }
      return s;
    });
    onStepsChange(next);
  }, [interactive, onStepsChange, steps, onFlowNodesChange]);

  return (
    <div className={`relative flex-1 min-h-0 ${className}`}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, node) => {
          const step = (node.data as FlowNodeData).step;
          onStepClick?.(step);
        }}
        onConnect={onConnect}
        onNodesChange={onNodesChange}
        nodesDraggable={interactive}
        nodesConnectable={interactive}
        elementsSelectable={interactive}
        deleteKeyCode={interactive ? ['Backspace', 'Delete'] : null}
        panOnScroll
        onInit={onInit}
        minZoom={0.35}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.78 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="#c8c8d4" />
        <Controls showInteractive={interactive} />
        <MiniMap
          nodeColor="#6366f1"
          maskColor="rgba(247,247,250,0.8)"
          className="!bg-white/80 !border-gray-200"
        />
      </ReactFlow>

      {interactive && onAddStepClick && (
        <button
          type="button"
          onClick={onAddStepClick}
          className="absolute bottom-28 right-6 z-10 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium shadow-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus size={16} />
          Schritt
        </button>
      )}
    </div>
  );
}
