"use client";

/**
 * Read-only React-Flow Visualisierung für Phase-3-Workflow-Pläne.
 *
 * Rein darstellend: keine n8n-Anbindung, kein Editing, keine API-Calls.
 * Nodes nicht verschiebbar/verbindbar — nur ein sauberer Graph aus den
 * Plan-Schritten (label, tool, type, description) mit Marken-Icons + Farben.
 */

import React, { useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { WorkflowStep } from '@/lib/types';
import { getToolVisual } from './tool-icons';

const NODE_W = 200;
const NODE_GAP = 72;
const STEP_X = NODE_W + NODE_GAP;

type PlanNodeData = {
  label: string;
  tool?: string;
  type?: string;
};

function PlanNode({ data }: NodeProps<Node<PlanNodeData>>) {
  const { Icon, color, label } = getToolVisual(data.tool, data.type);
  return (
    <div
      className="rounded-xl bg-white shadow-sm"
      style={{
        width: NODE_W,
        border: '1px solid #e5e7eb',
        borderTop: `4px solid ${color}`,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: 'none' }} />
      <div className="flex items-start gap-3 px-4 py-3">
        <div
          className="flex items-center justify-center rounded-lg shrink-0"
          style={{ width: 36, height: 36, background: `${color}18` }}
        >
          <Icon size={20} color={color} />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gray-900 leading-snug break-words">{data.label}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 truncate">{label}</p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: 'none' }} />
    </div>
  );
}

const nodeTypes = { plan: PlanNode };

export default function WorkflowPlanFlow({
  steps,
  className = '',
  interactive = false,
  height,
}: {
  steps: WorkflowStep[];
  className?: string;
  /** true = im Modal (Pan erlaubt). false = Karten-Vorschau (klick-durchlässig, statisch). */
  interactive?: boolean;
  height?: number;
}) {
  const { nodes, edges } = useMemo(() => {
    const safeSteps = steps ?? [];
    const nodes: Node<PlanNodeData>[] = safeSteps.map((step, i) => ({
      id: step.id || `step_${i + 1}`,
      type: 'plan',
      position: { x: i * STEP_X, y: 0 },
      data: {
        label: step.label,
        tool: step.tool,
        type: step.type,
      },
      draggable: false,
      selectable: false,
      connectable: false,
    }));

    const edges: Edge[] = [];
    for (let i = 0; i < safeSteps.length - 1; i++) {
      const from = safeSteps[i].id || `step_${i + 1}`;
      const to = safeSteps[i + 1].id || `step_${i + 2}`;
      edges.push({
        id: `e_${from}_${to}`,
        source: from,
        target: to,
        type: 'default',
        animated: false,
        style: { stroke: '#b0b0bc', strokeWidth: 2 },
      });
    }
    return { nodes, edges };
  }, [steps]);

  if (!steps || steps.length === 0) return null;

  return (
    <div
      className={`w-full ${className}`}
      style={{
        // height angegeben → fix; sonst: Modal füllt den Eltern-Container, Karte fix 150px
        height: height ?? (interactive ? '100%' : 150),
        backgroundColor: '#f7f7fa',
        borderRadius: 12,
        // Karten-Vorschau: Klicks gehen an den darunterliegenden Button (Workflow öffnen)
        pointerEvents: interactive ? 'auto' : 'none',
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: interactive ? 0.2 : 0.12, minZoom: interactive ? 0.6 : 0.1 }}
        defaultViewport={{ x: 0, y: 0, zoom: interactive ? 1.1 : 0.8 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={interactive}
        zoomOnPinch={interactive}
        zoomOnDoubleClick={false}
        panOnDrag={interactive}
        panOnScroll={false}
        preventScrolling={false}
        minZoom={0.2}
        maxZoom={2}
      >
        {interactive && (
          <Controls
            showZoom
            showFitView
            showInteractive={false}
            position="bottom-right"
            style={{ bottom: 16, right: 16 }}
          />
        )}
      </ReactFlow>
    </div>
  );
}
