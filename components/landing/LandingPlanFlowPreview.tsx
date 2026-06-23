'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import WorkflowFlowNode, { type FlowNodeData } from '@/components/canvas/WorkflowFlowNode';
import type { WorkflowStep } from '@/lib/types';

const PLAN_STEPS: WorkflowStep[] = [
  {
    id: 'p1',
    label: 'Neue Anfrage',
    type: 'trigger',
    tool: 'schedule',
    position: { x: 0, y: 24 },
    note: 'Startet bei neuer CRM-Anfrage',
  },
  {
    id: 'p2',
    label: 'Kundendaten',
    type: 'action',
    tool: 'google_sheets',
    position: { x: 158, y: 24 },
    note: 'Liest Zeile aus dem Kundenblatt',
  },
  {
    id: 'p3',
    label: 'Angebot-KI',
    type: 'ai',
    tool: 'openai',
    position: { x: 316, y: 24 },
    note: 'Erstellt Angebots-Entwurf',
  },
  {
    id: 'p4',
    label: 'Freigabe',
    type: 'human',
    position: { x: 474, y: 24 },
    note: 'Du gibst kurz frei',
  },
  {
    id: 'p5',
    label: 'Versand',
    type: 'output',
    tool: 'gmail',
    position: { x: 632, y: 24 },
    note: 'Mail geht raus',
  },
];

const PLAN_EDGES: Edge[] = PLAN_STEPS.slice(0, -1).map((step, i) => ({
  id: `pe-${i}`,
  source: step.id,
  target: PLAN_STEPS[i + 1].id,
  style: { stroke: '#b0b0bc', strokeWidth: 2 },
}));

const nodeTypes = { workflowStep: WorkflowFlowNode };

export default function LandingPlanFlowPreview() {
  const [visibleCount, setVisibleCount] = useState(1);
  const flowRef = useRef<ReactFlowInstance<Node<FlowNodeData>, Edge> | null>(null);

  useEffect(() => {
    let n = 1;
    const t = setInterval(() => {
      n += 1;
      if (n > PLAN_STEPS.length) {
        clearInterval(t);
        return;
      }
      setVisibleCount(n);
    }, 680);
    return () => clearInterval(t);
  }, []);

  const visibleSteps = useMemo(
    () => PLAN_STEPS.slice(0, visibleCount),
    [visibleCount],
  );

  const nodes: Node<FlowNodeData>[] = useMemo(
    () =>
      visibleSteps.map((step) => ({
        id: step.id,
        type: 'workflowStep',
        position: step.position ?? { x: 0, y: 0 },
        data: {
          step,
          state: 'default',
          interactive: false,
        },
      })),
    [visibleSteps],
  );

  const edges = useMemo(() => {
    const ids = new Set(visibleSteps.map((s) => s.id));
    return PLAN_EDGES.filter((e) => ids.has(e.source) && ids.has(e.target));
  }, [visibleSteps]);

  const onInit = useCallback((instance: ReactFlowInstance<Node<FlowNodeData>, Edge>) => {
    flowRef.current = instance;
    requestAnimationFrame(() => {
      instance.fitView({ padding: 0.15, duration: 200 });
    });
  }, []);

  useEffect(() => {
    flowRef.current?.fitView({ padding: 0.15, duration: 250 });
  }, [visibleCount]);

  return (
    <div className="h-[250px] sm:h-[260px] rounded-xl border border-gray-200 overflow-hidden bg-[#f4f4f7] workflow-flow-editor">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={onInit}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        preventScrolling
        proOptions={{ hideAttribution: true }}
        minZoom={0.35}
        maxZoom={1}
      >
        <Background gap={18} size={1} color="#c8c8d4" />
      </ReactFlow>
    </div>
  );
}
