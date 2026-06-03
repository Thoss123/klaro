"use client";

/**
 * Read-only n8n-style workflow visualization (Sprint 4/5).
 *
 * Renders the deployed n8n workflow JSON (`{ nodes, connections }`) as a node
 * graph that mirrors the n8n editor look: rounded node tiles with an icon,
 * bezier connectors with arrowheads, on a dotted canvas. Pure presentational —
 * no editing.
 */

import React, { useMemo } from 'react';

export interface N8nNode {
  id?: string;
  name: string;
  type: string;
  position?: [number, number];
  parameters?: Record<string, unknown>;
}

export interface N8nWorkflowJson {
  name?: string;
  nodes?: N8nNode[];
  connections?: Record<string, { main?: Array<Array<{ node: string }>> }>;
}

/** Map an n8n node type → friendly label, emoji, accent color. */
function nodeMeta(type: string): { label: string; icon: string; color: string } {
  const t = (type || '').toLowerCase();
  const table: [RegExp, { label: string; icon: string; color: string }][] = [
    [/manualtrigger/, { label: 'Manual', icon: '▶', color: '#9ca3af' }],
    [/webhook/, { label: 'Webhook', icon: '🔗', color: '#0ea5e9' }],
    [/scheduletrigger|cron/, { label: 'Schedule', icon: '⏰', color: '#0ea5e9' }],
    [/gmail|emailsend/, { label: 'Gmail', icon: '📧', color: '#ef4444' }],
    [/googledocs/, { label: 'Google Docs', icon: '📄', color: '#3b82f6' }],
    [/googlesheets/, { label: 'Sheets', icon: '📊', color: '#22c55e' }],
    [/slack/, { label: 'Slack', icon: '💬', color: '#7c3aed' }],
    [/notion/, { label: 'Notion', icon: '📝', color: '#111827' }],
    [/hubspot/, { label: 'HubSpot', icon: '🧲', color: '#f97316' }],
    [/airtable/, { label: 'Airtable', icon: '🗃️', color: '#f59e0b' }],
    [/openai|langchain/, { label: 'AI', icon: '🤖', color: '#10b981' }],
    [/httprequest/, { label: 'HTTP', icon: '🌐', color: '#6366f1' }],
    [/\bif\b|filter|switch/, { label: 'Decision', icon: '◇', color: '#eab308' }],
    [/\bset\b/, { label: 'Set', icon: '✎', color: '#64748b' }],
  ];
  for (const [re, meta] of table) if (re.test(t)) return meta;
  return { label: type.split('.').pop() || 'Node', icon: '⚙', color: '#64748b' };
}

const NODE_W = 132;
const NODE_H = 56;
const PAD = 40;

export default function WorkflowGraph({
  workflow,
  className = '',
  height = 280,
}: {
  workflow: N8nWorkflowJson | null | undefined;
  className?: string;
  height?: number;
}) {
  const layout = useMemo(() => {
    const nodes = (workflow?.nodes || []).filter(Boolean);
    if (nodes.length === 0) return null;

    // Use n8n positions when present; otherwise lay out left→right.
    const positioned = nodes.map((n, i) => {
      const [px, py] = n.position && n.position.length === 2 ? n.position : [200 + i * 250, 300];
      return { node: n, x: px, y: py };
    });

    const minX = Math.min(...positioned.map(p => p.x));
    const minY = Math.min(...positioned.map(p => p.y));
    const maxX = Math.max(...positioned.map(p => p.x));
    const maxY = Math.max(...positioned.map(p => p.y));
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);

    // Normalize raw positions into a tidy grid coordinate space.
    const stepX = NODE_W + 64;
    const stepY = NODE_H + 48;
    const placed = positioned.map(p => ({
      ...p,
      gx: PAD + ((p.x - minX) / spanX) * Math.max(spanX > 1 ? (positioned.length - 1) * stepX : 0, 0),
      gy: PAD + ((p.y - minY) / spanY) * (spanY > 1 ? 2 * stepY : 0),
    }));

    // If positions collapsed (all equal), fall back to a clean horizontal row.
    const collapsed = placed.every(p => p.gx === placed[0].gx);
    const finalNodes = collapsed
      ? positioned.map((p, i) => ({ ...p, gx: PAD + i * stepX, gy: PAD }))
      : placed;

    const byName = new Map(finalNodes.map(p => [p.node.name, p]));
    const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const conns = workflow?.connections || {};
    for (const [src, outputs] of Object.entries(conns)) {
      const from = byName.get(src);
      if (!from) continue;
      for (const group of outputs.main || []) {
        for (const target of group || []) {
          const to = byName.get(target.node);
          if (!to) continue;
          edges.push({
            x1: from.gx + NODE_W,
            y1: from.gy + NODE_H / 2,
            x2: to.gx,
            y2: to.gy + NODE_H / 2,
          });
        }
      }
    }

    const width = Math.max(...finalNodes.map(p => p.gx + NODE_W)) + PAD;
    const totalHeight = Math.max(...finalNodes.map(p => p.gy + NODE_H)) + PAD;
    return { nodes: finalNodes, edges, width, height: totalHeight };
  }, [workflow]);

  if (!layout) {
    return (
      <div className={`grid place-items-center text-xs text-gray-400 ${className}`} style={{ height }}>
        Keine Workflow-Daten.
      </div>
    );
  }

  return (
    <div
      className={`overflow-auto rounded-xl border border-gray-200 bg-[#f7f7fa] ${className}`}
      style={{ height }}
    >
      <svg
        width={layout.width}
        height={Math.max(layout.height, height)}
        style={{
          backgroundImage: 'radial-gradient(#d6d6e0 1px, transparent 1px)',
          backgroundSize: '18px 18px',
          minWidth: '100%',
        }}
      >
        <defs>
          <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#9ca3af" />
          </marker>
        </defs>

        {/* Edges */}
        {layout.edges.map((e, i) => {
          const dx = Math.max(40, (e.x2 - e.x1) / 2);
          const d = `M ${e.x1} ${e.y1} C ${e.x1 + dx} ${e.y1}, ${e.x2 - dx} ${e.y2}, ${e.x2} ${e.y2}`;
          return <path key={i} d={d} fill="none" stroke="#9ca3af" strokeWidth={2} markerEnd="url(#wf-arrow)" />;
        })}

        {/* Nodes */}
        {layout.nodes.map((p, i) => {
          const meta = nodeMeta(p.node.type);
          return (
            <g key={p.node.id || p.node.name || i} transform={`translate(${p.gx}, ${p.gy})`}>
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={10}
                fill="#ffffff"
                stroke={meta.color}
                strokeWidth={1.5}
                style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.06))' }}
              />
              <rect width={6} height={NODE_H} rx={3} fill={meta.color} />
              <text x={20} y={24} fontSize={16}>{meta.icon}</text>
              <text x={42} y={22} fontSize={11} fontWeight={700} fill="#374151">{meta.label}</text>
              <text x={42} y={38} fontSize={9.5} fill="#9ca3af">
                {truncate(p.node.name, 16)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
