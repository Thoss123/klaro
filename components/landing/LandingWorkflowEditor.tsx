'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Check, Play, Power, Zap } from 'lucide-react';
import N8nNodeIcon from '@/components/canvas/N8nNodeIcon';
import { getToolVisual } from '@/components/canvas/tool-icons';

const LIVE_NODES = [
  { id: 'trigger', tool: 'schedule', type: 'trigger', label: 'Neue Anfrage', isTrigger: true },
  { id: 'sheets', tool: 'google_sheets', type: 'action', label: 'Kundendaten', isTrigger: false },
  { id: 'ai', tool: 'openai', type: 'ai', label: 'Angebot-KI', isTrigger: false },
  { id: 'human', tool: null, type: 'human', label: 'Freigabe', isTrigger: false },
  { id: 'gmail', tool: 'gmail', type: 'output', label: 'Versand', isTrigger: false },
] as const;

export default function LandingWorkflowEditor({
  title = 'Angebote automatisieren',
}: {
  title?: string;
}) {
  const [runIdx, setRunIdx] = useState(0);
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<{ d: string }[]>([]);

  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setRunIdx(i >= LIVE_NODES.length ? LIVE_NODES.length - 1 : i);
    }, 550);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const measure = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const canvasRect = canvas.getBoundingClientRect();
      const centers = nodeRefs.current.map((el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: r.left - canvasRect.left + r.width / 2,
          y: r.top - canvasRect.top + r.height * 0.38,
        };
      });
      const next: { d: string }[] = [];
      for (let j = 0; j < centers.length - 1; j += 1) {
        const a = centers[j];
        const b = centers[j + 1];
        if (!a || !b) continue;
        const dx = Math.max(28, (b.x - a.x) * 0.45);
        next.push({
          d: `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`,
        });
      }
      setEdges(next);
    };
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [runIdx]);

  const allSuccess = runIdx >= LIVE_NODES.length - 1;

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 bg-white">
        <p className="text-[11px] font-bold text-gray-900 truncate min-w-0">{title}</p>
        <div className="flex items-center gap-1 shrink-0">
          <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
            <Check size={9} strokeWidth={2.5} />
            Deployed
          </span>
          <span className="hidden sm:inline-flex items-center gap-0.5 text-[9px] font-semibold text-white bg-amber-600 px-2 py-1 rounded-md">
            <Power size={9} />
            Live schalten
          </span>
          <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-white bg-green-600 px-2 py-1 rounded-md">
            <Play size={9} fill="white" />
            Testen
          </span>
        </div>
      </div>

      <div
        ref={canvasRef}
        className="relative h-[210px] sm:h-[220px] bg-[#f4f4f7] overflow-hidden"
        style={{
          backgroundImage: 'radial-gradient(circle, #c8c8d4 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      >
        <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
          {edges.map((e, i) => (
            <path
              key={i}
              d={e.d}
              fill="none"
              stroke="#b0b0bc"
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
        </svg>

        <div className="absolute inset-x-0 top-7 flex items-start justify-center gap-1 sm:gap-2 px-2">
          {LIVE_NODES.map((node, i) => (
            <div
              key={node.id}
              ref={(el) => {
                nodeRefs.current[i] = el;
              }}
            >
              <ShowcaseFlowNode
                tool={node.tool}
                type={node.type}
                label={node.label}
                isTrigger={node.isTrigger}
                runStatus={i < runIdx ? 'success' : i === runIdx ? 'running' : undefined}
              />
            </div>
          ))}
        </div>

        <div className="absolute bottom-2 right-2 w-[72px] h-[48px] rounded-md border border-gray-200 bg-white/90 shadow-sm overflow-hidden pointer-events-none">
          <svg viewBox="0 0 72 48" className="w-full h-full" aria-hidden>
            <rect width="72" height="48" fill="#fafafa" />
            {[12, 28, 44, 60].map((x, i) => (
              <rect
                key={i}
                x={x - 5}
                y={14}
                width={10}
                height={10}
                rx={2}
                fill="white"
                stroke={i <= runIdx ? '#22c55e' : '#c8c8d4'}
                strokeWidth={1.5}
              />
            ))}
            <path
              d="M 17 19 C 22 19, 23 19, 28 19 M 33 19 C 38 19, 39 19, 44 19 M 49 19 C 54 19, 55 19, 60 19"
              stroke="#b0b0bc"
              strokeWidth={1}
              fill="none"
            />
          </svg>
        </div>

        <AnimatePresence>
          {allSuccess && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-lg bg-green-600 text-white px-2.5 py-1 shadow-lg text-[10px] font-medium"
            >
              <Check size={11} strokeWidth={2.5} />
              Testlauf erfolgreich
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[min(100%,280px)] pointer-events-none">
          <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 backdrop-blur-sm shadow-md px-3 py-1.5">
            <span className="flex-1 text-[10px] text-gray-400 truncate">
              Webhook-Pfad für CRM eintragen…
            </span>
            <span className="grid h-6 w-6 place-items-center rounded-full bg-indigo-600 text-white shrink-0">
              <ArrowUp size={12} strokeWidth={2.5} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShowcaseFlowNode({
  tool,
  type,
  label,
  isTrigger,
  runStatus,
}: {
  tool: string | null;
  type: string;
  label: string;
  isTrigger: boolean;
  runStatus?: 'success' | 'running';
}) {
  const visual = getToolVisual(tool, type);
  const border =
    runStatus === 'running'
      ? 'border-indigo-500 ring-2 ring-indigo-200 animate-pulse'
      : runStatus === 'success'
        ? 'border-green-500 ring-2 ring-green-200'
        : 'border-[#c8c8d4]';

  return (
    <div className="flex flex-col items-center pointer-events-none" style={{ width: 54 }}>
      <div className="relative flex items-center justify-center" style={{ width: 44, height: 44 }}>
        <span
          className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white z-10"
          style={{ width: 7, height: 7, border: '2px solid #b0b0bc' }}
        />
        <span
          className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 rounded-full bg-white z-10"
          style={{ width: 7, height: 7, border: '2px solid #b0b0bc' }}
        />

        {isTrigger && (
          <div
            className="absolute z-20 flex items-center justify-center rounded-full bg-[#ff6d5a] border-2 border-white"
            style={{ width: 14, height: 14, top: -4, left: -4 }}
          >
            <Zap size={8} className="text-white" fill="white" />
          </div>
        )}

        <div
          className={`relative flex items-center justify-center bg-white rounded-md border-2 shadow-sm ${border}`}
          style={{ width: 44, height: 44 }}
        >
          <N8nNodeIcon
            tool={tool ?? undefined}
            type={type}
            label={label}
            size={20}
            color={visual.color}
          />
        </div>

        {runStatus === 'success' && (
          <div
            className="absolute z-20 flex items-center justify-center rounded-full bg-green-500 border-2 border-white"
            style={{ width: 14, height: 14, bottom: -2, right: -2 }}
          >
            <Check size={8} className="text-white" strokeWidth={3} />
          </div>
        )}
      </div>
      <span className="text-[8px] font-medium text-gray-700 mt-1 text-center leading-tight max-w-[54px]">
        {label}
      </span>
    </div>
  );
}
