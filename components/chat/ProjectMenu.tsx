"use client"

import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Check, Lock } from 'lucide-react';
import { SessionSummary } from '@/lib/supabase-chat';

const PHASE_ORDER = ['diagnose', 'analyse', 'plan', 'umsetzung'];
const PHASE_LABELS: Record<string, string> = {
  diagnose: 'Diagnose',
  analyse: 'Analyse',
  plan: 'Plan',
  umsetzung: 'Umsetzung',
};

interface ProjectMenuProps {
  currentProject: { id: string; name: string } | null;
  canvasPhase: string;
  sessions: SessionSummary[];
  onPhaseSelect: (phase: string) => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onCreate: () => void;
  /** Called after a navigation action (e.g. to close the sidebar). */
  onNavigate?: () => void;
}

/**
 * Vertical project controls for the slide-in sidebar:
 * editable project name, phase navigation, and project actions
 * (formerly the fixed top-right ProjectHeader bar).
 */
export default function ProjectMenu({
  currentProject,
  canvasPhase,
  sessions,
  onPhaseSelect,
  onRename,
  onDelete,
  onCreate,
  onNavigate,
}: ProjectMenuProps) {
  const [projectName, setProjectName] = useState(currentProject?.name ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setProjectName(currentProject?.name ?? '');
  }, [currentProject?.id]);

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
  const projectSessions = sessions.filter(s => s.project_id === currentProject.id);
  const phaseStatus = (phase: string): 'completed' | 'active' | 'locked' => {
    const idx = PHASE_ORDER.indexOf(phase);
    if (idx < currentPhaseIdx) return 'completed';
    if (idx === currentPhaseIdx) return 'active';
    return projectSessions.some(s => s.phase === phase) ? 'completed' : 'locked';
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Project name */}
      <div>
        <div className="px-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
          <span>Projekt</span>
          {isSaving && <span className="text-gray-300 normal-case font-medium">Speichert…</span>}
        </div>
        <input
          value={projectName}
          onChange={e => handleNameChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="w-full text-sm font-semibold text-gray-800 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-colors"
          maxLength={60}
          placeholder="Projektname"
          title="Projektname – wird automatisch gespeichert"
        />
      </div>

      {/* Phase navigation */}
      <div>
        <div className="px-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Phasen</div>
        <div className="flex flex-col gap-0.5">
          {PHASE_ORDER.map((phase, idx) => {
            const status = phaseStatus(phase);
            const isActive = status === 'active';
            const isCompleted = status === 'completed';
            const isLocked = status === 'locked';
            return (
              <button
                key={phase}
                disabled={isLocked}
                onClick={() => {
                  if (isLocked) return;
                  onPhaseSelect(phase);
                  onNavigate?.();
                }}
                className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-colors
                  ${isActive ? 'bg-indigo-50' : ''}
                  ${isLocked ? 'cursor-not-allowed opacity-50' : 'hover:bg-gray-50'}`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0
                  ${isCompleted ? 'border-gray-800 bg-gray-800' : ''}
                  ${isActive ? 'border-gray-800' : ''}
                  ${isLocked ? 'border-gray-200' : ''}`}
                >
                  {isCompleted && <Check size={11} strokeWidth={3} className="text-white" />}
                  {isActive && <div className="w-2 h-2 rounded-full bg-gray-800" />}
                  {isLocked && <Lock size={10} className="text-gray-300" />}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className={`text-[10px] font-bold tracking-widest uppercase ${isActive || isCompleted ? 'text-gray-400' : 'text-gray-300'}`}>
                    Phase 0{idx + 1}
                  </span>
                  <span className={`text-sm font-semibold truncate ${isActive ? 'text-gray-900' : isCompleted ? 'text-gray-700' : 'text-gray-300'}`}>
                    {PHASE_LABELS[phase]}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Project actions */}
      <div className="flex flex-col gap-0.5">
        <button
          onClick={() => { onCreate(); onNavigate?.(); }}
          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Plus size={16} className="text-gray-400" /> Neues Projekt
        </button>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={16} /> Projekt löschen
          </button>
        ) : (
          <div className="px-2.5 py-2">
            <p className="text-xs text-gray-600 mb-2.5 leading-relaxed">
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
                onClick={() => { onDelete(); setShowDeleteConfirm(false); onNavigate?.(); }}
                className="flex-1 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg py-2 transition-colors"
              >
                Löschen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
