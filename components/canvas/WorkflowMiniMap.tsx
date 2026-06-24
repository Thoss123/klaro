"use client";

/**
 * Minimap im n8n-Stil: weiße Node-Kästen, graue Verbindungen, gepunkteter Hintergrund.
 */

import { memo, useCallback, useEffect, useRef } from 'react';
import { Panel, useStore, useStoreApi, type Node } from '@xyflow/react';
import {
  XYMinimap,
  getInternalNodesBounds,
  getBoundsOfRects,
  getNodeDimensions,
  getStraightPath,
} from '@xyflow/system';
import { shallow } from 'zustand/shallow';
import type { FlowNodeData } from './WorkflowFlowNode';
import type { AddStepNodeData } from './WorkflowAddStepNode';
import { ADD_STEP_NODE_PREFIX } from '@/lib/workflow-graph';

const WIDTH = 140;
const HEIGHT = 96;
const ICON = 76;
const OFFSET = 5;

type CanvasNode = Node<FlowNodeData | AddStepNodeData>;

function nodeRect(node: CanvasNode, x: number, y: number, width: number, height: number) {
  if (node.type === 'addStep') {
    const size = Math.min(width, height, 28);
    return {
      x: x + (width - size) / 2,
      y: y + (height - size) / 2,
      w: size,
      h: size,
      rx: 4,
    };
  }
  const iconW = Math.min(ICON, width);
  const iconH = Math.min(ICON, height * 0.55);
  return {
    x: x + (width - iconW) / 2,
    y: y + 4,
    w: iconW,
    h: iconH,
    rx: 6,
  };
}

function nodeStroke(node: CanvasNode): string {
  if (node.type === 'addStep') return '#c8c8d4';
  const state = (node.data as FlowNodeData | undefined)?.state;
  if (state === 'configured') return '#22c55e';
  if (state === 'needsCredential') return '#f87171';
  if (node.selected || state === 'selected') return '#818cf8';
  return '#c8c8d4';
}

function edgeAnchor(
  node: CanvasNode,
  x: number,
  y: number,
  width: number,
  height: number,
  side: 'left' | 'right',
) {
  const r = nodeRect(node, x, y, width, height);
  return {
    x: side === 'right' ? r.x + r.w : r.x,
    y: r.y + r.h / 2,
  };
}

const filterVisible = (node: { hidden?: boolean }) => !node.hidden;

function WorkflowMiniMapComponent() {
  const store = useStoreApi();
  const svgRef = useRef<SVGSVGElement>(null);
  const viewScaleRef = useRef(0);
  const minimapRef = useRef<ReturnType<typeof XYMinimap> | null>(null);

  const {
    boundingRect,
    viewBB,
    nodeLookup,
    edges,
    rfId,
    panZoom,
    translateExtent,
    flowWidth,
    flowHeight,
  } = useStore((s) => {
    const viewBB = {
      x: -s.transform[0] / s.transform[2],
      y: -s.transform[1] / s.transform[2],
      width: s.width / s.transform[2],
      height: s.height / s.transform[2],
    };
    return {
      viewBB,
      boundingRect: s.nodeLookup.size > 0
        ? getBoundsOfRects(getInternalNodesBounds(s.nodeLookup, { filter: filterVisible }), viewBB)
        : viewBB,
      nodeLookup: s.nodeLookup,
      edges: s.edges,
      rfId: s.rfId,
      panZoom: s.panZoom,
      translateExtent: s.translateExtent,
      flowWidth: s.width,
      flowHeight: s.height,
    };
  }, shallow);

  const scaledWidth = boundingRect.width / WIDTH;
  const scaledHeight = boundingRect.height / HEIGHT;
  const viewScale = Math.max(scaledWidth, scaledHeight);
  const viewWidth = viewScale * WIDTH;
  const viewHeight = viewScale * HEIGHT;
  const offset = OFFSET * viewScale;
  const vx = boundingRect.x - (viewWidth - boundingRect.width) / 2 - offset;
  const vy = boundingRect.y - (viewHeight - boundingRect.height) / 2 - offset;
  const vw = viewWidth + offset * 2;
  const vh = viewHeight + offset * 2;

  // Keep the latest viewScale in a ref so the minimap's getViewScale callback reads the
  // current value without re-subscribing. Written in an effect (not during render).
  useEffect(() => {
    viewScaleRef.current = viewScale;
  }, [viewScale]);

  useEffect(() => {
    if (svgRef.current && panZoom) {
      minimapRef.current = XYMinimap({
        domNode: svgRef.current,
        panZoom,
        getTransform: () => store.getState().transform,
        getViewScale: () => viewScaleRef.current,
      });
      return () => minimapRef.current?.destroy();
    }
  }, [panZoom, store]);

  useEffect(() => {
    minimapRef.current?.update({
      translateExtent,
      width: flowWidth,
      height: flowHeight,
      pannable: true,
      zoomable: true,
      zoomStep: 1,
    });
  }, [translateExtent, flowWidth, flowHeight]);

  const onSvgClick = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    minimapRef.current?.pointer(event.nativeEvent);
  }, []);

  const nodeEntries = Array.from(nodeLookup.entries()).flatMap(([id, internal]) => {
    const node = internal.internals.userNode as CanvasNode;
    if (!node || node.hidden) return [];
    const { x, y } = internal.internals.positionAbsolute;
    const { width, height } = getNodeDimensions(node);
    if (!width || !height) return [];
    return [{ id, node, x, y, width, height }];
  });

  return (
    <Panel position="bottom-right" className="workflow-flow-minimap">
      <svg
        ref={svgRef}
        width={WIDTH}
        height={HEIGHT}
        viewBox={`${vx} ${vy} ${vw} ${vh}`}
        className="workflow-flow-minimap-svg"
        role="img"
        aria-labelledby={`workflow-minimap-${rfId}`}
        onClick={onSvgClick}
      >
        <title id={`workflow-minimap-${rfId}`}>Mini Map</title>

        <defs>
          <pattern id={`workflow-minimap-dots-${rfId}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#c8c8d4" />
          </pattern>
        </defs>
        <rect x={vx} y={vy} width={vw} height={vh} fill={`url(#workflow-minimap-dots-${rfId})`} />
        <rect x={vx} y={vy} width={vw} height={vh} fill="#f7f7fa" fillOpacity={0.92} />

        {edges.map(edge => {
          if (edge.hidden) return null;
          const source = nodeLookup.get(edge.source);
          const target = nodeLookup.get(edge.target);
          if (!source || !target) return null;
          const sNode = source.internals.userNode as CanvasNode;
          const tNode = target.internals.userNode as CanvasNode;
          if (!sNode || !tNode || sNode.hidden || tNode.hidden) return null;

          const sPos = source.internals.positionAbsolute;
          const tPos = target.internals.positionAbsolute;
          const sDim = getNodeDimensions(sNode);
          const tDim = getNodeDimensions(tNode);
          const from = edgeAnchor(sNode, sPos.x, sPos.y, sDim.width, sDim.height, 'right');
          const to = edgeAnchor(tNode, tPos.x, tPos.y, tDim.width, tDim.height, 'left');
          const [path] = getStraightPath({ sourceX: from.x, sourceY: from.y, targetX: to.x, targetY: to.y });
          const isAi = edge.id.startsWith('e-ai-') || edge.style?.strokeDasharray != null;
          const isConnector = edge.target.startsWith(ADD_STEP_NODE_PREFIX);

          return (
            <path
              key={edge.id}
              d={path}
              fill="none"
              stroke={isAi ? '#a78bfa' : '#b0b0bc'}
              strokeWidth={isConnector ? 1.5 : 2}
              strokeDasharray={isAi ? '4 3' : undefined}
              strokeLinecap="round"
            />
          );
        })}

        {nodeEntries.map(({ id, node, x, y, width, height }) => {
          const r = nodeRect(node, x, y, width, height);
          return (
            <rect
              key={id}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx={r.rx}
              ry={r.rx}
              fill="#ffffff"
              stroke={nodeStroke(node)}
              strokeWidth={node.type === 'addStep' ? 1 : 1.25}
            />
          );
        })}

        <path
          className="workflow-flow-minimap-mask"
          d={`M${vx - offset},${vy - offset}h${vw + offset * 2}v${vh + offset * 2}h${-vw - offset * 2}z
            M${viewBB.x},${viewBB.y}h${viewBB.width}v${viewBB.height}h${-viewBB.width}z`}
          fillRule="evenodd"
          pointerEvents="none"
        />
      </svg>
    </Panel>
  );
}

export default memo(WorkflowMiniMapComponent);
