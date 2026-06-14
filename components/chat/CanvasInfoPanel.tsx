"use client"

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Lock } from 'lucide-react';

const PHASE_ORDER = ['diagnose', 'analyse', 'plan', 'umsetzung'];
const PHASE_LABELS: Record<string, string> = {
  diagnose: 'Diagnose',
  analyse: 'Analyse',
  plan: 'Plan',
  umsetzung: 'Umsetzung',
};

type Props = {
  phase: string;
  maxReachedPhase: string;
  currentProject: { id: string; name: string };
  onPhaseClick: (phase: string) => void;
  onRename: (name: string) => void;
};

/**
 * Fixed top-right overlay on the canvas (desktop): phase progress pill with
 * dropdown + project name as a plain auto-saving input (no dropdown).
 */
export default function CanvasInfoPanel({
  phase,
  maxReachedPhase,
  currentProject,
  onPhaseClick,
  onRename,
}: Props) {
  const [phaseMenuOpen, setPhaseMenuOpen] = useState(false);
  const [nameVal, setNameVal] = useState(currentProject.name);
  const [isSaving, setIsSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset während des Renderns (React-Pattern) statt per Effect: Input neu
  // befüllen, wenn Projekt wechselt oder der Name extern umbenannt wurde.
  const [prevProject, setPrevProject] = useState({ id: currentProject.id, name: currentProject.name });
  if (prevProject.id !== currentProject.id || prevProject.name !== currentProject.name) {
    setPrevProject({ id: currentProject.id, name: currentProject.name });
    setNameVal(currentProject.name);
  }

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPhaseMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const currentIdx = Math.max(0, PHASE_ORDER.indexOf(phase));
  const maxReachedIdx = Math.max(0, PHASE_ORDER.indexOf(maxReachedPhase));
  const progress = ((currentIdx + 1) / PHASE_ORDER.length) * 100;

  const handleNameChange = (val: string) => {
    setNameVal(val);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const name = val.trim();
      if (name && name !== currentProject.name) {
        setIsSaving(true);
        try { await onRename(name); } finally { setIsSaving(false); }
      }
    }, 800);
  };

  return (
    <div ref={ref} className="absolute top-6 right-6 z-30 flex items-stretch gap-2.5">
      {/* Phase progress pill with dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setPhaseMenuOpen(o => !o)}
          className="h-full flex items-center gap-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow pl-4 pr-3 py-2.5"
          title="Phase wechseln"
        >
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-700 whitespace-nowrap">
            Phase 0{currentIdx + 1} <span className="text-gray-400">/ 0{PHASE_ORDER.length}</span>
          </span>
          <span className="w-28 h-2 rounded-full bg-gray-200/70 overflow-hidden">
            <span className="block h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${progress}%` }} />
          </span>
          <ChevronDown size={15} className={`text-gray-400 transition-transform ${phaseMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {phaseMenuOpen && (
          <div className="absolute top-[calc(100%+8px)] left-0 w-60 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 z-50">
            {PHASE_ORDER.map((p, idx) => {
              const accessible = idx <= maxReachedIdx;
              const isActive = idx === currentIdx;
              const isCompleted = idx < currentIdx;
              return (
                <button
                  key={p}
                  disabled={!accessible}
                  onClick={() => { if (accessible) { onPhaseClick(p); setPhaseMenuOpen(false); } }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors
                    ${isActive ? 'bg-green-50' : accessible ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
                >
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0
                    ${isCompleted ? 'border-green-600 bg-green-600' : isActive ? 'border-green-500' : 'border-gray-200'}`}
                  >
                    {isCompleted ? <Check size={11} strokeWidth={3} className="text-white" />
                      : isActive ? <span className="w-2 h-2 rounded-full bg-green-500" />
                      : !accessible ? <Lock size={10} className="text-gray-300" /> : null}
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Phase 0{idx + 1}</span>
                    <span className={`text-sm font-semibold truncate ${isActive ? 'text-gray-900' : accessible ? 'text-gray-700' : 'text-gray-300'}`}>
                      {PHASE_LABELS[p]}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Project name — plain input, auto-saved */}
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl shadow-sm px-2 py-1.5">
        <input
          value={nameVal}
          onChange={e => handleNameChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          maxLength={60}
          placeholder="Projektname"
          title="Projektname – wird automatisch gespeichert"
          className="w-44 bg-transparent text-sm font-semibold text-gray-800 px-2 py-1 rounded-lg focus:outline-none focus:bg-gray-50 transition-colors"
        />
        {isSaving && <span className="text-[10px] text-gray-300 font-medium pr-1 shrink-0">Speichert…</span>}
      </div>
    </div>
  );
}
