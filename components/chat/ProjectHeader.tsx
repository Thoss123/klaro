"use client"

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Upload, MoreHorizontal, Plus, Trash2, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { SessionSummary } from '@/lib/supabase-chat';

const PHASE_ORDER = ['diagnose', 'analyse', 'plan'];
const PHASE_LABELS: Record<string, string> = {
  diagnose: 'Diagnose',
  analyse: 'Analyse',
  plan: 'Plan',
};

interface ProjectHeaderProps {
  currentProject: { id: string; name: string } | null;
  canvasPhase: string;
  sessions: SessionSummary[];
  onPhaseSelect: (phase: string) => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onCreate: () => void;
}

export default function ProjectHeader({
  currentProject,
  canvasPhase,
  sessions,
  onPhaseSelect,
  onRename,
  onDelete,
  onCreate,
}: ProjectHeaderProps) {
  const [isPhaseOpen, setIsPhaseOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [projectName, setProjectName] = useState(currentProject?.name ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const phaseRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep name in sync when project changes
  useEffect(() => {
    setProjectName(currentProject?.name ?? '');
  }, [currentProject?.id]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (phaseRef.current && !phaseRef.current.contains(e.target as Node)) setIsPhaseOpen(false);
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setIsMoreOpen(false);
        setShowDeleteConfirm(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Auto-save project name with debounce
  const handleNameChange = (val: string) => {
    setProjectName(val);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (val.trim() && val.trim() !== currentProject?.name) {
        setIsSaving(true);
        try {
          await onRename(val.trim());
        } finally {
          setIsSaving(false);
        }
      }
    }, 800);
  };

  if (!currentProject) return null;

  const currentPhaseIdx = PHASE_ORDER.indexOf(canvasPhase);
  const totalPhases = PHASE_ORDER.length;

  // Determine status of each phase for this project
  const projectSessions = sessions.filter(s => s.project_id === currentProject.id);
  const phaseStatus = (phase: string): 'completed' | 'active' | 'locked' => {
    const idx = PHASE_ORDER.indexOf(phase);
    if (idx < currentPhaseIdx) return 'completed';
    if (idx === currentPhaseIdx) return 'active';
    const hasSession = projectSessions.some(s => s.phase === phase);
    return hasSession ? 'completed' : 'locked';
  };

  return (
    <div className="fixed top-5 right-5 flex items-center gap-2 z-40">
      {/* ── Phase pill ── */}
      <div className="relative" ref={phaseRef}>
        <button
          onClick={() => setIsPhaseOpen(o => !o)}
          className="bg-white border border-gray-200 shadow-sm rounded-xl h-10 px-4 flex items-center gap-3 hover:bg-gray-50 transition-colors"
        >
          <span className="text-xs font-bold text-gray-800 tracking-wide whitespace-nowrap">
            PHASE 0{currentPhaseIdx + 1}&nbsp;/&nbsp;0{totalPhases}
          </span>
          {/* Progress bar */}
          <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${((currentPhaseIdx + 1) / totalPhases) * 100}%` }}
            />
          </div>
          <ChevronDown
            size={14}
            className={`text-gray-400 transition-transform duration-200 ${isPhaseOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Phase dropdown */}
        <AnimatePresence>
          {isPhaseOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute top-12 left-0 w-72 bg-white border border-gray-200 rounded-2xl shadow-xl py-2 z-50 overflow-hidden"
            >
              {PHASE_ORDER.map((phase, idx) => {
                const status = phaseStatus(phase);
                const isActive = status === 'active';
                const isCompleted = status === 'completed';
                const isLocked = status === 'locked';

                return (
                  <button
                    key={phase}
                    onClick={() => {
                      if (!isLocked) {
                        onPhaseSelect(phase);
                        setIsPhaseOpen(false);
                      }
                    }}
                    disabled={isLocked}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                      ${isActive ? 'bg-indigo-50' : ''}
                      ${isLocked ? 'cursor-not-allowed' : 'hover:bg-gray-50'}
                    `}
                  >
                    {/* Status indicator */}
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                      ${isCompleted ? 'border-gray-800 bg-gray-800' : ''}
                      ${isActive ? 'border-gray-800' : ''}
                      ${isLocked ? 'border-gray-200' : ''}
                    `}>
                      {isCompleted && <Check size={11} strokeWidth={3} className="text-white" />}
                      {isActive && <div className="w-2 h-2 rounded-full bg-gray-800" />}
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span className={`text-[10px] font-bold tracking-widest uppercase
                        ${isActive || isCompleted ? 'text-gray-500' : 'text-gray-300'}
                      `}>
                        Phase 0{idx + 1}
                      </span>
                      <span className={`text-sm font-semibold truncate
                        ${isActive ? 'text-gray-900' : isCompleted ? 'text-gray-700' : 'text-gray-300'}
                      `}>
                        {PHASE_LABELS[phase]}
                      </span>
                    </div>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Project name + actions ── */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-xl h-10 px-3 flex items-center gap-2">
        {/* Inline editable name */}
        <input
          value={projectName}
          onChange={e => handleNameChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="text-sm font-semibold text-gray-800 bg-transparent focus:outline-none min-w-0 w-40 truncate"
          maxLength={60}
          title="Projektname – wird automatisch gespeichert"
        />
        {isSaving && (
          <span className="text-[10px] text-gray-400 shrink-0">Speichert…</span>
        )}
      </div>

      {/* ── Share (placeholder) ── */}
      <button
        disabled
        title="Teilen – kommt bald"
        className="bg-white border border-gray-200 shadow-sm rounded-xl h-10 w-10 flex items-center justify-center text-gray-400 cursor-not-allowed opacity-60"
      >
        <Upload size={15} />
      </button>
      <button
        disabled
        className="bg-gray-900 text-white text-sm font-semibold rounded-xl h-10 px-4 opacity-50 cursor-not-allowed"
      >
        Share
      </button>

      {/* ── More menu (create / delete) ── */}
      <div className="relative" ref={moreRef}>
        <button
          onClick={() => { setIsMoreOpen(o => !o); setShowDeleteConfirm(false); }}
          className="bg-white border border-gray-200 shadow-sm rounded-xl h-10 w-10 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <MoreHorizontal size={16} />
        </button>

        <AnimatePresence>
          {isMoreOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute top-12 right-0 w-52 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 z-50"
            >
              <button
                onClick={() => { onCreate(); setIsMoreOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Plus size={15} className="text-gray-400" />
                Neues Projekt
              </button>

              <div className="h-px bg-gray-100 my-1" />

              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={15} />
                  Projekt löschen
                </button>
              ) : (
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-600 mb-3 leading-relaxed">
                    Wirklich löschen? Alle Chats bleiben erhalten.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg py-2 transition-colors"
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={() => { onDelete(); setIsMoreOpen(false); setShowDeleteConfirm(false); }}
                      className="flex-1 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg py-2 transition-colors"
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
