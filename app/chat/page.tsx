"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import ChatWindow from '@/components/chat/ChatWindow';
import ChatInput from '@/components/chat/ChatInput';
import OptionsCard, { parseOptionsTag } from '@/components/chat/OptionsCard';
import RoadmapCanvas from '@/components/canvas/RoadmapCanvas';
import { Message, CanvasData, OnboardingData, AgentAction, WorkflowStep, StepConfig, WorkflowStepConfigs, Workflow } from '@/lib/types';
import {
  createSession,
  createProject,
  loadSessions,
  loadSessionMessages,
  loadSessionCanvas,
  loadSessionOnboarding,
  saveMessage,
  saveCanvas,
  updateSessionTitle,
  SessionSummary,
  markWelcomeSent,
  isWelcomeSent,
  ensureDefaultProject,
  updateProjectName,
  deleteProject,
  loadProjectCanvas,
  saveProjectCanvas,
  loadProjectMemory,
  saveProjectMemory,
  loadCrossProjectContext,
  savePhaseFeedback,
  hasPhaseFeedback,
} from '@/lib/supabase-chat';
import ProjectMenu from '@/components/chat/ProjectMenu';
import SupportModal from '@/components/chat/SupportModal';
import PhaseFeedbackModal, { type PhaseFeedbackData } from '@/components/chat/PhaseFeedbackModal';
import CanvasInfoPanel from '@/components/chat/CanvasInfoPanel';
import SidebarAccountOverview from '@/components/chat/SidebarAccountOverview';
import { getAccountDisplayInfo } from '@/lib/account-display';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import type { User } from '@supabase/supabase-js';
import { useRouter, useSearchParams } from 'next/navigation';
import { Menu, Maximize2, Minimize2, X, Plus, Home as HomeIcon, MessageCircle, ChevronRight, ChevronDown, Check, Loader2, Sparkles, Brain, FileText, Zap, Key, Rocket, Activity, Database, Search, RotateCcw, History, HelpCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { stripInternalTags } from '@/lib/strip-internal-tags';
import { detectCompletedPhase } from '@/lib/detect-phase-transition';
import { canAdvanceFromPhase } from '@/lib/can-phase-complete';
import { getHiddenInitMessage } from '@/lib/phase-welcome';
import { PHASE_LABELS, PHASE_ORDER, normalizePhase, phaseIndex } from '@/lib/phases';
import {
  shouldAutoKickoffSession,
  getSessionKickoff,
  pickLatestSessionForPhase,
} from '@/lib/session-kickoff';
import {
  type ChatAttachment,
  embedUserAttachments,
  formatAttachmentsForCoach,
  parseUserAttachments,
  attachmentsForApi,
} from '@/lib/chat-attachments';
import { coachStatusMessageForCanvas } from '@/lib/coach-status-messages';
import { canvasSkipUserLabel, evaluateCanvasEligibility, logSync } from '@/lib/sync-decision';
import { healUmsetzungCanvas, splitPlansForUmsetzung } from '@/lib/workflow-plans';
import { normalizeCanvasData } from '@/lib/canvas-normalize';
import { isHiddenSystemMessage } from '@/lib/hidden-chat';
import { titleFromUserMessage } from '@/lib/session-title';

// ---- Agent Actions Feed Component ----
// Renders inline in the chat flow like a real AI-agent tool call:
// a subtle card that shimmers while "running" then flips to a done state.
function AgentActionsFeed({ actions, inline = false }: { actions: AgentAction[], inline?: boolean }) {
  // Per-turn memory sync is internal noise — never surface it in the chat (user request).
  const visibleActions = actions.filter(a => a.type !== 'memory_update');
  if (visibleActions.length === 0) return null;

  const iconMap: Record<string, React.ReactNode> = {
    canvas_update: <Sparkles size={13} />,
    phase_summary: <FileText size={13} />,
    phase_prepare: <Zap size={13} />,
    memory_save: <Brain size={13} />,
    memory_update: <Brain size={13} />,
    request_credential: <Key size={13} />,
    deploy_workflow: <Rocket size={13} />,
    test_workflow: <Activity size={13} />,
    research_solutions: <Search size={13} />,
    build_workflow: <Rocket size={13} />,
    edit_workflow: <Rocket size={13} />,
    create_workflow_plan: <Sparkles size={13} />,
  };

  return (
    <div className={inline ? 'flex flex-col gap-1.5 mb-6 ml-12' : 'px-5 pb-2'}>
      <AnimatePresence mode="popLayout" initial={false}>
        {visibleActions.map(action => (
          <motion.div
            key={action.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            <div className={`relative overflow-hidden flex items-center gap-2 px-2 py-1.5 text-[13px] font-medium transition-colors ${
              action.status === 'running'
                ? 'text-gray-400'
                : action.status === 'done'
                ? 'text-gray-500'
                : 'text-red-500'
            }`}>
              {/* Shimmer overlay while running */}
              {action.status === 'running' && (
                <motion.div
                  className="absolute inset-0 -translate-x-full"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.10), transparent)' }}
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ repeat: Infinity, duration: 1.3, ease: 'easeInOut' }}
                />
              )}
              {action.status === 'running' ? (
                <Loader2 size={13} className="animate-spin shrink-0 text-indigo-500 relative z-10" />
              ) : action.status === 'done' ? (
                <Check size={13} className="shrink-0 relative z-10" strokeWidth={3} />
              ) : (
                <X size={13} className="shrink-0 relative z-10" />
              )}
              <span className="opacity-50 shrink-0 relative z-10">{iconMap[action.type]}</span>
              <span className="truncate relative z-10">{action.label}</span>
              {action.detail && (
                <span className="ml-auto text-[10px] opacity-60 shrink-0 relative z-10">{action.detail}</span>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function getChatBackgroundStatus(
  agentActions: AgentAction[],
  opts: { isPreparingNextPhase: boolean; sessionPhase: string },
): string | null {
  const running = agentActions.filter(a => a.status === 'running');
  const phaseIdx = phaseIndex(opts.sessionPhase);
  const nextPhaseKey =
    phaseIdx >= 0 && phaseIdx < PHASE_ORDER.length - 1 ? PHASE_ORDER[phaseIdx + 1] : null;
  const nextLabel = nextPhaseKey ? PHASE_LABELS[nextPhaseKey] : null;

  const phasePrepRunning =
    opts.isPreparingNextPhase ||
    running.some(
      a =>
        a.type === 'phase_summary' ||
        a.type === 'phase_prepare' ||
        a.type === 'memory_save',
    );

  if (phasePrepRunning && nextLabel) {
    return `${nextLabel} wird vorbereitet (Zusammenfassung, Memory, Canvas). Du kannst schon weiterschreiben — der Button „${nextLabel} starten“ erscheint gleich darunter.`;
  }

  if (running.length > 0) {
    const researching = running.some(a => a.type === 'research_solutions');
    if (researching) {
      return 'Axantilo recherchiert Lösungsansätze — du kannst schon weiterschreiben.';
    }
    return 'Canvas und Memory werden im Hintergrund aktualisiert — du kannst schon weiterschreiben.';
  }

  return null;
}

/** Tracks whether the viewport is below the `md` breakpoint (mobile). */
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);
  return isMobile;
}

const emptyCanvas: CanvasData = {
  pain_points: [],
  use_cases: [],
  workflows: [],
  documents: [],
  phase: 'diagnose',
};

// ---- DEV: Context Inspector ----
type DevContextData = {
  model: string;
  phase: string;
  contextLimit: number;
  systemPrompt: string;
  tokens: { total: number; remaining: number; system: number; history: number; pct: number };
  history: Array<{ role: string; content: string }>;
};

function DevContextModal({
  messages, onboarding, phase, canvas, onClose,
}: {
  messages: Message[];
  onboarding: Partial<OnboardingData> | null;
  phase: string;
  canvas: CanvasData;
  onClose: () => void;
}) {
  const [data, setData] = React.useState<DevContextData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState<'tokens' | 'system' | 'history'>('tokens');

  React.useEffect(() => {
    fetch('/api/dev/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, onboarding, phase, canvas }),
    })
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const pct = data?.tokens?.pct ?? 0;
  const barColor = pct < 50 ? 'bg-emerald-400' : pct < 75 ? 'bg-amber-400' : pct < 90 ? 'bg-orange-500' : 'bg-red-500';
  const statusColor = pct < 50 ? 'text-emerald-600' : pct < 75 ? 'text-amber-600' : pct < 90 ? 'text-orange-600' : 'text-red-600';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0f0f13] border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 h-[82vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">⚡ DEV</span>
            <span className="text-sm font-semibold text-white">Context Inspector</span>
            {data && (
              <span className="text-[11px] font-mono text-white/40">{data.model} · phase={data.phase}</span>
            )}
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 pb-0 shrink-0">
          {(['tokens', 'system', 'history'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors ${tab === t ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
            >
              {t === 'tokens' ? '📊 Tokens' : t === 'system' ? '🧠 System Prompt' : '💬 History'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center h-full text-white/30 text-sm">
              <Loader2 size={16} className="animate-spin mr-2" /> Lade Kontext…
            </div>
          )}

          {!loading && data && tab === 'tokens' && (
            <div className="space-y-6">
              {/* Big token number */}
              <div className="text-center py-4">
                <div className={`text-5xl font-bold font-mono ${statusColor}`}>
                  {data.tokens.total.toLocaleString('de')}
                </div>
                <div className="text-white/40 text-sm mt-1">
                  von {data.contextLimit.toLocaleString('de')} Token Limit
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-[11px] font-mono text-white/40 mb-1.5">
                  <span>{pct}% verbraucht</span>
                  <span>~{data.tokens.remaining.toLocaleString('de')} verbleibend</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${barColor}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
              </div>

              {/* Breakdown */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'System Prompt', value: data.tokens.system, icon: '🧠' },
                  { label: 'Chat-History', value: data.tokens.history, icon: '💬' },
                  { label: 'Nachrichten', value: data.history.length, icon: '📨', unit: 'Msgs' },
                  { label: 'Status', value: pct < 50 ? 'Frisch' : pct < 75 ? 'OK' : pct < 90 ? 'Voll' : 'KRITISCH', icon: pct < 50 ? '✅' : pct < 75 ? '🟡' : pct < 90 ? '🟠' : '🔴', noNum: true },
                ].map(({ label, value, icon, unit, noNum }) => (
                  <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <div className="text-white/40 text-[11px] mb-1">{icon} {label}</div>
                    <div className="font-mono font-bold text-white text-xl">
                      {noNum ? value : typeof value === 'number' ? value.toLocaleString('de') : value}
                      {unit && <span className="text-xs text-white/40 ml-1">{unit}</span>}
                      {!noNum && !unit && <span className="text-xs text-white/40 ml-1">tok</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-[10px] text-white/20 text-center">
                ~3.5 Zeichen/Token (Schätzung für Mistral mit deutschem Text)
              </div>
            </div>
          )}

          {!loading && data && tab === 'system' && (
            <pre className="text-[12px] font-mono text-emerald-300 whitespace-pre-wrap leading-relaxed">
              {data.systemPrompt}
            </pre>
          )}

          {!loading && data && tab === 'history' && (
            <div className="space-y-3">
              {data.history.length === 0 && (
                <div className="text-white/30 text-sm text-center py-8">Keine Nachrichten</div>
              )}
              {data.history.map((m, i: number) => (
                <div key={i} className={`rounded-xl p-3 border ${m.role === 'user' ? 'bg-indigo-950/50 border-indigo-500/20' : 'bg-white/5 border-white/10'}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${m.role === 'user' ? 'text-indigo-400' : 'text-white/50'}`}>
                      {m.role === 'user' ? '👤 User' : '🤖 Assistant'}
                    </span>
                    <span className="text-[10px] font-mono text-white/20">~{Math.ceil(m.content.length / 3.5)} tok</span>
                  </div>
                  <pre className="text-[11px] font-mono text-white/70 whitespace-pre-wrap leading-relaxed">
                    {m.content}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Phase 4: Credential Popup ----
const TOOL_ICONS: Record<string, string> = {
  gmail: '📧', google_docs: '📄', google_sheets: '📊', slack: '💬',
  notion: '📝', hubspot: '🧲', airtable: '🗃️', openai: '🤖',
  gemini: '✨', mistral: '🌬️', webhook: '🔗', http: '🌐',
};

function CredentialPopup({
  tool, label, type,
  projectId,
  onSaved,
  onClose,
}: {
  tool: string;
  label: string;
  type: string;
  projectId: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!value.trim()) { setError('Bitte gib den API-Key ein.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/n8n/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, tool_name: tool, credential_type: type, value: value.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Fehler beim Speichern');
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.18 }}
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm mx-4 overflow-hidden"
      >
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl">
              {TOOL_ICONS[tool] || '🔑'}
            </div>
            <div>
              <div className="font-semibold text-gray-800 text-sm">{label}</div>
              <div className="text-[11px] text-gray-400 font-mono">{tool}</div>
            </div>
          </div>

          <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
            {type === 'oauth' ? 'Access Token / API Key' : 'API Key'}
          </label>
          <input
            autoFocus
            type="password"
            placeholder={`${tool} API Key...`}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
          />
          {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
        </div>

        <div className="flex items-center gap-2 px-6 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm text-gray-500 font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
            {saving ? 'Verbinde…' : 'Verbinden'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ChatPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [userId, setUserId] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);

  // ---- Core state ----
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionMemory, setSessionMemory] = useState<string>('');
  const [input, setInput] = useState('');
  const [dismissedOptionsId, setDismissedOptionsId] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDevModalOpen, setIsDevModalOpen] = useState(false);
  const [isResettingPhase, setIsResettingPhase] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [phaseFeedback, setPhaseFeedback] = useState<{ phase: string; isFinal: boolean } | null>(null);
  // Phasen, für die in dieser Session-Lebenszeit das Feedback-Popup schon gezeigt wurde.
  const feedbackShownRef = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const activeTurnRef = useRef(0);
  // Cross-project context (returning users) — loaded once per project, not per message.
  const crossProjectCtxRef = useRef<{ projId: string | null; text: string | null } | null>(null);
  const lastCoachStatusKeyRef = useRef<string | null>(null);
  const [canvasData, setCanvasData] = useState<CanvasData>(emptyCanvas);
  // Mirror of canvasData so sendMessage always reads the latest canvas at execution
  // time — a stale closure (e.g. the kickoff fired 400ms after a phase reset) must not
  // re-persist the pre-reset workflows back into project_canvas.
  const canvasDataRef = useRef<CanvasData>(emptyCanvas);
  useEffect(() => {
    canvasDataRef.current = canvasData;
  }, [canvasData]);
  const [onboarding, setOnboarding] = useState<OnboardingData | null>(null);
  /** Chat/API phase — always follows the active session, not project_canvas.progress */
  const [sessionPhase, setSessionPhase] = useState<string>('diagnose');

  // ---- Session state ----
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isPreparingNextPhase, setIsPreparingNextPhase] = useState(false);
  const [preparedNextSessionId, setPreparedNextSessionId] = useState<string | null>(null);
  // Phase-4-Abschluss: „Was kommt als Nächstes?" (weiterer Workflow / neuer Bereich) läuft.
  const [isNextStepBusy, setIsNextStepBusy] = useState(false);
  // Kurzer Hinweis-Toast (z. B. „keine Internetverbindung") — blendet sich selbst aus.
  const [netToast, setNetToast] = useState<string | null>(null);
  useEffect(() => {
    if (!netToast) return;
    const t = setTimeout(() => setNetToast(null), 4000);
    return () => clearTimeout(t);
  }, [netToast]);
  const [agentActions, setAgentActions] = useState<AgentAction[]>([]);
  const [, setPendingWelcome] = useState<{ sessionId: string, onboarding?: OnboardingData } | null>(null);
  // Synchronous in-memory lock: prevents concurrent isHiddenInit calls racing through
  // before React state (isStreaming) has had a chance to update.
  const welcomeInProgressRef = useRef<Set<string>>(new Set());

  // ---- UI state ----
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Unter xl (1280px): schmales Chat-Panel (360px); ab xl standardmäßig breit (600px). Manuell überschreibbar.
  const [maximizeOverride, setMaximizeOverride] = useState<boolean | null>(null);
  const [isClosed, setIsClosed] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const historyMenuRef = useRef<HTMLDivElement>(null);
  // Mobile: only one of chat / canvas is shown at a time, toggled via a bottom-center switch.
  const isMobile = useIsMobile();
  const isCompactDesktop = useIsMobile(1280);
  const isMaximized = !isMobile && (maximizeOverride ?? !isCompactDesktop);
  const [mobileView, setMobileView] = useState<'chat' | 'canvas'>('chat');

  useEffect(() => {
    if (!isHistoryOpen) return;
    const close = (e: MouseEvent) => {
      if (historyMenuRef.current && !historyMenuRef.current.contains(e.target as Node)) {
        setIsHistoryOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [isHistoryOpen]);

  const openSidebar = useCallback(() => {
    setIsHistoryOpen(false);
    setIsSidebarOpen(true);
  }, []);

  // ---- Phase 4 state ----
  const [credentialRequest, setCredentialRequest] = useState<{ tool: string; label: string; type: string } | null>(null);
  // Interactive deploy cards: workflowId → stepId → StepConfig
  const [workflowStepConfigs, setWorkflowStepConfigs] = useState<WorkflowStepConfigs>({});
  // workflowId → deployed DB workflow id (drives the card's deployed/run state)
  const [deployedWorkflowIds, setDeployedWorkflowIds] = useState<Record<string, string>>({});
  const [openDeployWorkflowId, setOpenDeployWorkflowId] = useState<string | null>(null);

  const syncStepConfigsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Project state ----
  // Muss VOR handleStepConfigSave stehen: der Callback liest currentProject?.id
  // im Body und Dependency-Array (sonst Temporal-Dead-Zone-Crash beim Render).
  const [currentProject, setCurrentProject] = useState<{ id: string, name: string } | null>(null);

  const handleStepConfigSave = useCallback((workflowId: string, stepId: string, config: StepConfig) => {
    setWorkflowStepConfigs(prev => {
      const next = {
        ...prev,
        [workflowId]: { ...(prev[workflowId] ?? {}), [stepId]: config },
      };
      
      if (currentProject?.id) {
        if (syncStepConfigsTimerRef.current) clearTimeout(syncStepConfigsTimerRef.current);
        syncStepConfigsTimerRef.current = setTimeout(() => {
          setCanvasData(canvas => {
            const nextCanvas = { ...canvas, workflow_step_configs: next };
            saveProjectCanvas(currentProject.id, nextCanvas).catch(console.error);
            return nextCanvas;
          });
        }, 1500);
      }

      return next;
    });
  }, [currentProject]);

  // ---- Dev state ----
  // Maps canvas workflow_id → deployed DB workflow id
  const deployedWorkflowIdsRef = useRef<Record<string, string>>({});
  const prepareNextPhaseRef = useRef<((switchAfter?: boolean) => Promise<void>) | null>(null);
  const phasePrepTriggeredForRef = useRef<Set<string>>(new Set());

  const withSessionPhase = useCallback((canvas: CanvasData, phase: string): CanvasData => ({
    ...canvas,
    phase: normalizePhase(phase),
  }), []);

  // Interne Gesprächsstrategie fortschreiben (fail-open, fire-and-forget).
  // Canvas-Änderungen werden debounced (~15s), damit nicht jeder Teil-Update
  // einen LLM-Call auslöst; Phasenwechsel feuern sofort.
  const strategyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postStrategyUpdate = useCallback(
    (projectId: string, mode: 'phase_transition' | 'canvas_delta', phase?: string, summary?: string) => {
      fetch('/api/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, mode, phase, summary }),
      }).catch(() => { /* fail-open */ });
    },
    [],
  );
  const scheduleStrategyCanvasUpdate = useCallback(
    (projectId: string, phase: string) => {
      if (strategyDebounceRef.current) clearTimeout(strategyDebounceRef.current);
      strategyDebounceRef.current = setTimeout(() => {
        strategyDebounceRef.current = null;
        postStrategyUpdate(projectId, 'canvas_delta', phase);
      }, 15_000);
    },
    [postStrategyUpdate],
  );

  // Bereits deployte n8n-Workflows aus der DB hydrieren (canvas_workflow_id → DB-Workflow-id).
  // Ohne das denkt der Client nach jedem Reload „noch nicht deployt" und erstellt Duplikate.
  useEffect(() => {
    const projId = currentProject?.id;
    if (!projId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/n8n/workflows?project_id=${projId}`);
        if (!res.ok) return;
        const { workflows } = await res.json() as {
          workflows?: Array<{ id: string; canvas_workflow_id?: string | null; n8n_workflow_id?: string | null }>;
        };
        if (cancelled || !workflows) return;
        const map: Record<string, string> = {};
        for (const w of workflows) {
          // Nur echte Deploys (n8n-Workflow existiert) als „deployed" übernehmen.
          if (w.canvas_workflow_id && w.n8n_workflow_id) map[w.canvas_workflow_id] = w.id;
        }
        setDeployedWorkflowIds(map);
        deployedWorkflowIdsRef.current = map;
      } catch (e) {
        console.error('Hydrate deployed workflows failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [currentProject?.id]);

  const handleWorkflowPersist = useCallback((updated: Workflow) => {
    setCanvasData(prev => {
      const workflows = (prev.workflows ?? []).map(w =>
        w.id === updated.id ? { ...w, steps: updated.steps, edges: updated.edges } : w,
      );
      const next = { ...prev, workflows };
      if (currentProject?.id) {
        saveProjectCanvas(currentProject.id, next).catch(console.error);
      }
      return next;
    });
  }, [currentProject]);

  const maxReachedPhase = React.useMemo(() => {
    let maxIdx = phaseIndex(canvasData.phase);
    if (currentProject) {
      for (const s of sessions) {
        if (s.project_id !== currentProject.id) continue;
        const idx = phaseIndex(s.phase);
        if (idx > maxIdx) maxIdx = idx;
      }
    }
    return PHASE_ORDER[Math.max(0, maxIdx)] || 'diagnose';
  }, [sessions, currentProject, canvasData.phase]);

  const accountDisplay = useMemo(
    () => (authUser ? getAccountDisplayInfo(authUser, onboarding) : null),
    [authUser, onboarding],
  );

  const handleLogout = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setIsSidebarOpen(false);
    router.push('/');
  }, [router]);

  // ---- Agent action helpers ----
  // Actions render inline in the chat like real agent tool calls:
  // they shimmer while "running" then flip to a "done" label.
  const addAction = useCallback((type: AgentAction['type'], label: string, detail?: string): string => {
    const id = crypto.randomUUID();
    setAgentActions(prev => [...prev, { id, type, status: 'running', label, detail, timestamp: Date.now() }]);
    return id;
  }, []);

  const completeAction = useCallback((id: string, doneLabel?: string) => {
    setAgentActions(prev => prev.map(a => a.id === id
      ? { ...a, status: 'done', label: doneLabel || a.label }
      : a));
  }, []);

  const failAction = useCallback((id: string, errorLabel?: string) => {
    setAgentActions(prev => prev.map(a => a.id === id
      ? { ...a, status: 'error', label: errorLabel || a.label }
      : a));
  }, []);

  const clearActions = useCallback(() => setAgentActions([]), []);

  // ---- Phase 4: Process control tags ----
  const processPhase4Tags = useCallback(async (text: string, canvas: CanvasData, projId?: string | null) => {
    // Helper: auto-build mappings from workflow steps
    const autoMappings = (steps: WorkflowStep[]) => steps.map(step => {
      const tool = step.tool || (
        step.type === 'trigger' ? 'webhook' :
        step.type === 'ai'      ? 'openai'  :
        step.type === 'decision'? 'decision':
        step.type === 'output'  ? 'set'     : 'http'
      );
      return { step_id: step.id, tool, credential_id: undefined };
    });

    // <request_credential> — show credential popup to user
    const credMatch = text.match(/<request_credential>([\s\S]*?)<\/request_credential>/);
    if (credMatch) {
      try {
        const credData = JSON.parse(credMatch[1]);
        setCredentialRequest({ tool: credData.tool, label: credData.label || credData.tool, type: credData.type || 'api_key' });
      } catch {}
      // Stop here — deploy happens after credential is saved
      return;
    }

    // <deploy_workflow> — build and deploy to n8n
    const deployMatch = text.match(/<deploy_workflow>([\s\S]*?)<\/deploy_workflow>/);
    if (deployMatch && projId) {
      try {
        const tag = JSON.parse(deployMatch[1]);
        const canvasWorkflow = canvas.workflows.find(w => w.id === tag.workflow_id) || canvas.workflows[0];
        if (!canvasWorkflow) return;

        if (deployedWorkflowIdsRef.current[tag.workflow_id]) return; // already deployed

        const aid = addAction('deploy_workflow', `Deploye "${tag.name || canvasWorkflow.title}"…`);
        const res = await fetch('/api/n8n/workflows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projId,
            workflow: canvasWorkflow,
            mappings: autoMappings(canvasWorkflow.steps),
            name: tag.name || canvasWorkflow.title,
            linked_use_case: canvasWorkflow.linked_pain_point,
            canvas_workflow_id: canvasWorkflow.id,
          }),
        });
        if (res.ok) {
          const { workflow: dbWf } = await res.json();
          deployedWorkflowIdsRef.current[tag.workflow_id] = dbWf.id;
          completeAction(aid, `"${tag.name || canvasWorkflow.title}" deployed ✓`);
        } else {
          failAction(aid, `Deploy fehlgeschlagen`);
        }
      } catch (e) { console.error('deploy_workflow tag error:', e); }
    }

    // <test_workflow> — trigger test execution
    const testMatch = text.match(/<test_workflow>([\s\S]*?)<\/test_workflow>/);
    if (testMatch) {
      try {
        const tag = JSON.parse(testMatch[1]);
        const dbId = deployedWorkflowIdsRef.current[tag.workflow_id];
        if (!dbId) return;

        const aid = addAction('test_workflow', `Starte Test-Execution…`);
        const res = await fetch('/api/n8n/executions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflow_id: dbId }),
        });
        if (res.ok) {
          completeAction(aid, `Test-Durchlauf erfolgreich ✓`);
        } else {
          failAction(aid, `Test-Execution fehlgeschlagen`);
        }
      } catch (e) { console.error('test_workflow tag error:', e); }
    }

    // <activate_workflow> — activate in n8n
    const activateMatch = text.match(/<activate_workflow>([\s\S]*?)<\/activate_workflow>/);
    if (activateMatch) {
      try {
        const tag = JSON.parse(activateMatch[1]);
        const dbId = deployedWorkflowIdsRef.current[tag.workflow_id];
        if (!dbId) return;

        const aid = addAction('deploy_workflow', `Aktiviere Workflow…`);
        const res = await fetch('/api/n8n/workflows', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: dbId, action: 'activate' }),
        });
        if (res.ok) {
          completeAction(aid, `Workflow aktiv ✓`);
        } else {
          failAction(aid, `Aktivierung fehlgeschlagen`);
        }
      } catch (e) { console.error('activate_workflow tag error:', e); }
    }
  }, [addAction, completeAction, failAction]);

  // ---- Load sessions list from Supabase ----
  const refreshSessions = useCallback(async () => {
    try {
      const list = await loadSessions();
      setSessions(list);
      return list;
    } catch (err) {
      console.error('Error loading sessions:', err);
      return [];
    }
  }, []);

  /** Coach erklärt im Chat, warum die Roadmap (noch) nicht aktualisiert wurde. */
  const appendCoachStatusExplanation = useCallback(
    async (
      sessionId: string,
      reason: string | undefined,
      phase: string,
      canvas: CanvasData,
    ) => {
      const text = coachStatusMessageForCanvas(reason, phase, canvas);
      if (!text) return;
      const key = `${sessionId}:${reason ?? 'unknown'}:${text.slice(0, 48)}`;
      if (lastCoachStatusKeyRef.current === key) return;
      lastCoachStatusKeyRef.current = key;

      const statusMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: text,
      };
      setMessages(prev => [...prev, statusMsg]);
      try {
        await saveMessage(sessionId, 'assistant', text);
      } catch (e) {
        console.error('Coach-Status speichern fehlgeschlagen:', e);
      }
    },
    [],
  );

  // ---- Send message (Hoisted for use in useEffect) ----
  const sendMessage = useCallback(async (
    content: string, 
    isHiddenInit = false, 
    messagesOverride?: Message[], 
    targetSessionId?: string, 
    targetOnboarding?: OnboardingData
  ) => {
    const ob = targetOnboarding || onboarding || {
      ziel: '', ki_erfahrung: '', wer_setzt_um: '', hindernis: '', branche: '', tempo: '',
      unternehmensgroesse: '', vorname: '', firmenname: '', rolle_im_unternehmen: '',
    };
    const turnAttachments = isHiddenInit ? [] : [...pendingAttachments];
    if ((!content.trim() && !turnAttachments.length && !isHiddenInit) || isStreaming) return;

    let sessionId = targetSessionId || currentSessionId;
    if (!sessionId && userId) {
      try {
        sessionId = await createSession(ob, userId);
        setCurrentSessionId(sessionId);
        await refreshSessions();
      } catch (err) {
        console.error('Error creating session:', err);
        return;
      }
    }
    if (!sessionId) return;

    const userContent = isHiddenInit
      ? content
      : embedUserAttachments(content, turnAttachments);

    let newMessages: Message[] = [];
    if (messagesOverride) {
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: userContent,
      };
      newMessages = [...messagesOverride, userMessage];
      setMessages(newMessages);
      setInput('');
      setPendingAttachments([]);
    } else {
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: userContent,
      };
      newMessages = [...messages];
      if (!isHiddenInit) {
        newMessages.push(userMessage);
        setMessages(newMessages);
        setInput('');
        setPendingAttachments([]);
        setDismissedOptionsId(null);
      }
    }

    if (!isHiddenInit) {
      const lastUserMsg = newMessages[newMessages.length - 1];
      if (lastUserMsg && lastUserMsg.role === 'user') {
        await saveMessage(sessionId, 'user', lastUserMsg.content);

        const sessionList = await refreshSessions();
        const session = sessionList.find(s => s.id === sessionId);
        const phaseForTitle = session?.phase || sessionPhase || 'diagnose';
        const derived = titleFromUserMessage(lastUserMsg.content, phaseForTitle);
        if (session && derived && (!session.title || /^[1-4]\.\s/.test(session.title) && !session.title.includes('—'))) {
          await updateSessionTitle(sessionId, derived);
          refreshSessions();
        }
      }
    } else {
      // Synchronous lock: prevent two concurrent hidden-init calls for the same session
      // (React state updates are async, so isStreaming check at top isn't enough here)
      if (welcomeInProgressRef.current.has(sessionId)) return;
      welcomeInProgressRef.current.add(sessionId);
      // Also check DB in case of page reload
      const alreadySent = await isWelcomeSent(sessionId);
      if (alreadySent) {
        welcomeInProgressRef.current.delete(sessionId);
        return;
      }
      await markWelcomeSent(sessionId);
    }

    setIsStreaming(true);
    // Keep still-running background jobs visible; drop completed entries from prior turns.
    setAgentActions(prev => prev.filter(a => a.status === 'running'));
    const turnId = ++activeTurnRef.current;
    abortControllerRef.current = new AbortController();

    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    const chatPhase =
      sessions.find(s => s.id === sessionId)?.phase || sessionPhase || 'diagnose';

    try {
      const payloadMessages = isHiddenInit
        ? [{ role: 'user', content: getHiddenInitMessage(chatPhase) }]
        : newMessages.map((m, idx) => {
            const isLastUser = idx === newMessages.length - 1 && m.role === 'user';
            const { text } = parseUserAttachments(m.content);
            if (isLastUser) {
              return {
                role: 'user' as const,
                content: formatAttachmentsForCoach(text, turnAttachments),
              };
            }
            return { role: m.role, content: text || m.content };
          });

      // Load project memory for context injection
      let projectMemoryText = 'Bisher keine Historie.';
      let projId = currentProject?.id;
      if (!projId && sessionId) {
        projId = sessions.find(s => s.id === sessionId)?.project_id ?? undefined;
      }
      if (projId) {
        try {
          const memEntries = await loadProjectMemory(projId);
          if (memEntries.length > 0) {
            projectMemoryText = memEntries
              .map(e => `--- ${e.phase.toUpperCase()} Zusammenfassung ---\n${e.summary}`)
              .join('\n\n');
          }
        } catch {}
      }

      // Cross-project context: what this user's company already did in OTHER projects
      // (built workflows, company profile). Lets the coach recognize
      // returning users in Phase 1 instead of starting cold. Cached per project.
      let crossProjectText: string | null = null;
      const projKey = projId ?? null;
      if (crossProjectCtxRef.current && crossProjectCtxRef.current.projId === projKey) {
        crossProjectText = crossProjectCtxRef.current.text;
      } else {
        try {
          crossProjectText = await loadCrossProjectContext(projKey);
        } catch {
          crossProjectText = null;
        }
        crossProjectCtxRef.current = { projId: projKey, text: crossProjectText };
      }

      // Inject memory into onboarding for the API
      let fullMemoryText = projectMemoryText;
      if (crossProjectText) {
        const base = projectMemoryText === 'Bisher keine Historie.' ? '' : `${projectMemoryText}\n\n`;
        fullMemoryText = `${base}--- FRÜHERE PROJEKTE DIESES NUTZERS (firmenweit) ---\n${crossProjectText}`;
      }
      if (sessionMemory && sessionMemory !== 'Noch keine.') {
        fullMemoryText = `--- AKTUELLER SESSION-KONTEXT ---\n${sessionMemory}\n\n${fullMemoryText}`;
      }

      const obWithMemory = { ...ob, memory: fullMemoryText };

      // DEBUG: log what we're sending
      console.log('[chat] Sending to API — onboarding:', JSON.stringify(ob));
      console.log('[chat] phase:', chatPhase, '| isHiddenInit:', isHiddenInit);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          messages: payloadMessages,
          session_id: sessionId,
          project_id: projId ?? currentProject?.id ?? null,
          onboarding: obWithMemory,
          phase: chatPhase,
          canvas: withSessionPhase(canvasDataRef.current, chatPhase),
          attachments: attachmentsForApi(turnAttachments),
        })
      });

      if (!response.ok) {
        const errPreview = (await response.text()).slice(0, 200);
        const looksLikeHtml = /<!DOCTYPE|<html/i.test(errPreview);
        throw new Error(
          looksLikeHtml
            ? 'Chat-API nicht erreichbar (Build-Fehler?). Dev-Server neu starten.'
            : `Chat-API Fehler (${response.status}): ${errPreview}`
        );
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      streamReaderRef.current = reader;
      const decoder = new TextDecoder();
      let assistantContent = '';
      const streamCanvasData = withSessionPhase(canvasDataRef.current, chatPhase);
      const shownCanvasActions = new Set<string>();
      // Diagnose: id der „Canvas wird bearbeitet…"-Action, sobald der öffnende
      // <canvas_update>-Tag auftaucht — damit der schließende Tag sie nur noch
      // auf „fertig" kippt, statt eine neue anzulegen.
      let coachCanvasActionId: string | null = null;
      // Holder object (not a bare `let`) so TS keeps the Promise|null type:
      // the assignment happens inside the startCanvasWorker closure, which a
      // bare local would narrow away to `null` at the await site below.
      const canvasWorker: { current: Promise<void> | null } = { current: null };

      // Worker trigger (phases 2–4 only). Distinct from the coach's own data tag
      // <canvas_update>{…}</canvas_update> used in diagnose (handled separately below).
      const hasCanvasTrigger = (text: string) =>
        /trigger_canvas_update/i.test(text);

      // Diagnose: the COACH writes the canvas itself via a data tag — no worker LLM
      // (avoids invented pain points + unreliable numbers). Die gemergte Analyse
      // nutzt BEIDES: direkter Tag (idea_cards/tool_evaluations/rank/Struktur)
      // UND trigger_canvas_update für die Worker-Extraktion (use_cases/Tools).
      const coachWritesCanvas = chatPhase === 'diagnose';
      const coachCanvasTagEnabled = chatPhase === 'diagnose' || chatPhase === 'analyse';

      // Parse the coach's <canvas_update> JSON and write it straight to the canvas.
      // Merges by id onto the current canvas (coach sends the full set;
      // merge guards against accidental drops). Returns true if anything was written.
      const applyCoachCanvasUpdate = (jsonStr: string): boolean => {
        let parsed: {
          company?: Record<string, unknown>;
          pain_points?: Array<Record<string, unknown>>;
          idea_cards?: Array<Record<string, unknown>>;
          tool_evaluations?: Array<Record<string, unknown>>;
          solution_structures?: Array<Record<string, unknown>>;
        };
        try {
          parsed = JSON.parse(jsonStr.trim());
        } catch {
          logSync('canvas', 'fail', 'coach canvas tag: invalid JSON');
          return false;
        }
        const cur = canvasDataRef.current;
        // Kumulativ per id mergen — bestehende Einträge nie verlieren, auch wenn
        // der Coach einen Teilstand schickt.
        const mergeById = (
          existing: Array<Record<string, unknown>> | undefined,
          incoming: Array<Record<string, unknown>> | undefined,
          idPrefix: string,
        ): Array<Record<string, unknown>> => {
          const byId = new Map((existing || []).map(e => [String(e.id), e]));
          (incoming || []).forEach(e => {
            const id = (typeof e.id === 'string' && e.id) || `${idPrefix}_${byId.size + 1}`;
            byId.set(id, { ...byId.get(id), ...e, id });
          });
          return [...byId.values()];
        };
        const mergedRaw: Record<string, unknown> = {
          company: { ...(cur.company || {}), ...(parsed.company || {}) },
          pain_points: mergeById(
            (cur.pain_points || []) as unknown as Array<Record<string, unknown>>,
            parsed.pain_points,
            'pp',
          ),
        };
        if (parsed.idea_cards) {
          mergedRaw.idea_cards = mergeById(
            (cur.idea_cards || []) as unknown as Array<Record<string, unknown>>,
            parsed.idea_cards,
            'idea',
          );
        }
        if (parsed.tool_evaluations) {
          mergedRaw.tool_evaluations = mergeById(
            (cur.tool_evaluations || []) as unknown as Array<Record<string, unknown>>,
            parsed.tool_evaluations,
            'te',
          );
        }
        if (parsed.solution_structures) {
          mergedRaw.solution_structures = mergeById(
            (cur.solution_structures || []) as unknown as Array<Record<string, unknown>>,
            parsed.solution_structures,
            'ss',
          );
        }
        const normalized = normalizeCanvasData(mergedRaw, cur, chatPhase);
        const withPhase = withSessionPhase(normalized, chatPhase);
        setCanvasData(withPhase);
        if (projId) {
          saveProjectCanvas(projId, withPhase).catch(err =>
            logSync('canvas', 'fail', 'coach canvas save failed', { error: String(err) }),
          );
          scheduleStrategyCanvasUpdate(projId, chatPhase);
        }
        logSync('canvas', 'success', `coach wrote canvas (${chatPhase})`, {
          painPoints: (withPhase.pain_points || []).length,
          ideaCards: (withPhase.idea_cards || []).length,
          toolEvaluations: (withPhase.tool_evaluations || []).length,
        });
        return true;
      };

      logSync('canvas', 'turn', `msg turn session=${sessionId}`, {
        phase: chatPhase,
        hiddenInit: isHiddenInit,
        userPreview: (content || '').slice(0, 80),
      });
      logSync('memory', 'turn', `msg turn session=${sessionId}`, {
        phase: chatPhase,
        hiddenInit: isHiddenInit,
      });

      const canvasEval = evaluateCanvasEligibility({
        isHiddenInit,
        projectId: projId,
        phase: chatPhase,
        userMessages: payloadMessages,
        workerAlreadyScheduled: false,
      });
      logSync('canvas', 'evaluate', canvasEval.eligible ? 'eligible' : 'blocked', {
        reason: canvasEval.reason,
        detail: canvasEval.detail,
      });

      const startCanvasWorker = (source: 'tag' | 'auto_sync') => {
        if (coachWritesCanvas) {
          logSync('canvas', 'skip', `worker disabled — coach writes canvas itself (${source})`, { phase: chatPhase });
          return;
        }
        if (canvasWorker.current) {
          logSync('canvas', 'skip', `worker already scheduled (${source})`, { reason: 'worker_already_running' });
          return;
        }
        if (!canvasEval.eligible) {
          logSync('canvas', 'skip', `not invoked (${source})`, {
            reason: canvasEval.reason,
            detail: canvasEval.detail,
          });
          void appendCoachStatusExplanation(sessionId, canvasEval.reason, chatPhase, streamCanvasData);
          return;
        }
        logSync('canvas', 'invoke', `POST /api/canvas-worker (${source})`, {
          projectId: projId,
          phase: chatPhase,
        });
        const aid = addAction('canvas_update', `Canvas wird bearbeitet…`);
        const workerHistory = [
          ...payloadMessages,
          { role: 'assistant', content: stripInternalTags(assistantContent) },
        ];
        canvasWorker.current = fetch('/api/canvas-worker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: abortControllerRef.current?.signal,
          body: JSON.stringify({
            history: workerHistory,
            currentCanvas: streamCanvasData,
            onboarding: obWithMemory,
            phase: streamCanvasData.phase,
            projectId: projId,
          }),
        })
          .then(async res => {
            const data = await res.json().catch(() => ({}));
            const status = data.status || (res.ok ? 'unknown' : 'error');
            const reason = data.reason || data.error || data.detail;
            const diff = data.diff;

            if (status === 'success' && data.canvas) {
              logSync('canvas', 'success', 'canvas updated', { diff, phase: chatPhase });
              const normalized = normalizeCanvasData(
                data.canvas as Record<string, unknown>,
                streamCanvasData,
                chatPhase
              );
              setCanvasData(withSessionPhase(normalized, chatPhase));
              completeAction(aid, 'Canvas aktualisiert');
              if (projId) scheduleStrategyCanvasUpdate(projId, chatPhase);
            } else if (status === 'skipped') {
              logSync('canvas', 'skip', 'worker returned skipped', { reason, detail: data.detail });
              completeAction(aid, `Canvas: ${canvasSkipUserLabel(reason, data.detail)}`);
              void appendCoachStatusExplanation(sessionId, reason, chatPhase, streamCanvasData);
            } else {
              logSync('canvas', 'fail', 'worker error', { reason, status });
              failAction(aid, `Canvas-Fehler (${reason || res.status})`);
            }
          })
          .catch(err => {
            logSync('canvas', 'fail', 'network error', { error: String(err) });
            failAction(aid, 'Canvas-Fehler (Netzwerk)');
          });
      };

      while (true) {
        if (abortControllerRef.current?.signal.aborted || activeTurnRef.current !== turnId) {
          await reader.cancel().catch(() => {});
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;

        // Diagnose: coach's own data tag <canvas_update>{…}</canvas_update> — write directly.
        // LIVE-Status: Sobald der ÖFFNENDE Tag im Stream auftaucht, sofort
        // „Canvas wird bearbeitet…" zeigen — nicht warten, bis das (ggf. große)
        // JSON mit </canvas_update> fertig ist.
        if (coachCanvasTagEnabled && assistantContent.includes('<canvas_update>') && !shownCanvasActions.has('coach_canvas_start')) {
          shownCanvasActions.add('coach_canvas_start');
          coachCanvasActionId = addAction('canvas_update', 'Canvas wird bearbeitet…');
        }

        // Schließender Tag da: JSON anwenden + Status auf „fertig" kippen.
        if (coachCanvasTagEnabled && assistantContent.includes('</canvas_update>') && !shownCanvasActions.has('coach_canvas')) {
          const m = assistantContent.match(/<canvas_update>([\s\S]*?)<\/canvas_update>/);
          if (m) {
            shownCanvasActions.add('coach_canvas');
            // Start-Trigger hat die Action i.d.R. schon angelegt; falls der Tag in
            // einem einzigen Chunk komplett ankam, hier nachziehen.
            const aid = coachCanvasActionId ?? addAction('canvas_update', 'Canvas wird bearbeitet…');
            const ok = applyCoachCanvasUpdate(m[1]);
            // Kurz den Running-Zustand stehen lassen (Spinner/Shimmer sichtbar),
            // bevor es auf „Canvas aktualisiert" kippt.
            setTimeout(
              () => completeAction(aid, ok ? 'Canvas aktualisiert' : 'Canvas: nichts Neues'),
              900,
            );
          }
        }

        if (!coachWritesCanvas && hasCanvasTrigger(assistantContent) && canvasEval.eligible) {
          if (!shownCanvasActions.has('trigger_canvas')) {
            shownCanvasActions.add('trigger_canvas');
            logSync('canvas', 'evaluate', 'coach sent trigger_canvas_update tag');
            startCanvasWorker('tag');
          }
        } else if (!coachWritesCanvas && hasCanvasTrigger(assistantContent) && !canvasEval.eligible) {
          logSync('canvas', 'skip', 'tag seen but blocked', {
            reason: canvasEval.reason,
            detail: canvasEval.detail,
          });
          void appendCoachStatusExplanation(sessionId, canvasEval.reason, chatPhase, streamCanvasData);
        }

        // <canvas_built> — Server signalisiert: Build FERTIG + gespeichert. Karte SOFORT laden
        // (kein Warten auf Supabase-Realtime). Tag kommt garantiert nach dem Build → kein Race.
        if (assistantContent.includes('</canvas_built>') && !shownCanvasActions.has('canvas_built')) {
          shownCanvasActions.add('canvas_built');
          const builtMatch = assistantContent.match(/<canvas_built>([\s\S]*?)<\/canvas_built>/);
          const builtProjId = currentProject?.id;
          if (builtMatch && builtProjId) {
            try {
              const built = JSON.parse(builtMatch[1]) as { workflow_id?: string };
              loadProjectCanvas(builtProjId)
                .then(pc => {
                  if (pc) setCanvasData(withSessionPhase(pc, chatPhase));
                  if (built.workflow_id) setOpenDeployWorkflowId(built.workflow_id);
                })
                .catch(console.error);
            } catch { /* ignore malformed tag */ }
          }
        }

        // <workflow_plan>{…}</workflow_plan> — der Coach legt in Phase 3 selbst einen
        // Workflow-Plan ins Canvas (kein Tool-Call mehr). Tag parsen, an create-plan-Route
        // schicken; Supabase Realtime liefert das fertige Canvas zurück.
        if (assistantContent.includes('</workflow_plan>')) {
          const planMatches = Array.from(
            assistantContent.matchAll(/<workflow_plan>([\s\S]*?)<\/workflow_plan>/g),
          );
          planMatches.forEach(match => {
            const key = `workflow_plan_${match[1]}`;
            if (shownCanvasActions.has(key)) return;
            const planProjId = currentProject?.id;
            if (!planProjId) return;
            let plan: { title?: string; description?: string; pain_point_id?: string; steps?: unknown; edges?: unknown };
            try {
              plan = JSON.parse(match[1].trim());
            } catch {
              return; // Tag noch unvollständig / kaputtes JSON — beim nächsten Chunk erneut versuchen
            }
            if (!plan.pain_point_id || !Array.isArray(plan.steps)) return;
            shownCanvasActions.add(key);
            const aid = addAction('create_workflow_plan', 'Aktualisiere Canvas…');
            fetch('/api/canvas-worker/create-plan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ project_id: planProjId, ...plan }),
            })
              .then(res => {
                completeAction(aid, res.ok ? 'Canvas aktualisiert' : 'Canvas: Plan fehlgeschlagen');
              })
              .catch(() => completeAction(aid, 'Canvas: Plan fehlgeschlagen'));
          });
        }

        // Process tool calls from the stream
        const toolMatches = Array.from(assistantContent.matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/g));
        if (toolMatches.length > 0) {
          toolMatches.forEach(match => {
            try {
              const toolCall = JSON.parse(match[1]);
              // Content-based key (not match.index): a <stream_reset> truncates the
              // buffer, so indices shift between rounds — an index key would collide
              // and skip a later tool call. The JSON payload is a stable dedup key.
              const key = `tool_${match[1]}`;
              if (!shownCanvasActions.has(key)) {
                shownCanvasActions.add(key);
                if (toolCall.type === 'deploy_workflow') {
                  const aid = addAction('deploy_workflow', `Deploye Workflow in n8n...`);
                  setTimeout(() => completeAction(aid, `Workflow erfolgreich deployed`), 2000);
                } else if (toolCall.type === 'test_workflow') {
                  const aid = addAction('test_workflow', `Teste Workflow-Execution...`);
                  setTimeout(() => completeAction(aid, `Test erfolgreich durchgelaufen`), 2500);
                } else if (toolCall.type === 'request_credential') {
                  const aid = addAction('request_credential', `Fordere Anmeldedaten an...`);
                  setTimeout(() => completeAction(aid, `Credential-Aufforderung an Nutzer gesendet`), 800);
                } else if (toolCall.type === 'research_solutions') {
                  const aid = addAction('research_solutions', `Recherchiere Lösungsansätze…`);
                  setTimeout(() => completeAction(aid, `Recherche abgeschlossen`), 4000);
                } else if (toolCall.type === 'build_workflow') {
                  const wfId = toolCall.args?.workflow_id as string | undefined;
                  const aid = addAction('build_workflow', `Baue Workflow live…`);
                  // Kein loadProjectCanvas hier — der Server baut & speichert, Supabase Realtime
                  // liefert das fertige Canvas (Race vermeiden). Nur das Auto-Open-Ziel merken.
                  if (wfId) setOpenDeployWorkflowId(wfId);
                  setTimeout(() => completeAction(aid, `Workflow auf Canvas`), 1200);
                } else if (toolCall.type === 'edit_workflow') {
                  const wfId = toolCall.args?.workflow_id as string | undefined;
                  const aid = addAction('edit_workflow', `Passe Workflow an…`);
                  const builtProjId = currentProject?.id;
                  if (builtProjId) {
                    loadProjectCanvas(builtProjId)
                      .then(pc => {
                        if (pc) setCanvasData(withSessionPhase(pc, chatPhase));
                        if (wfId) setOpenDeployWorkflowId(wfId);
                      })
                      .catch(console.error);
                  }
                  setTimeout(() => completeAction(aid, `Workflow angepasst`), 1200);
                }
              }
            } catch {}
          });
        }

        // <stream_reset> — der Coach hat in einer Tool-Runde voreilig live geantwortet;
        // verwirf den bisher angezeigten Text, nur die finale Antwort soll stehen bleiben.
        // Tag-Seiteneffekte vor dem Reset (Tool-Calls, Builds) sind bereits gefeuert und
        // über shownCanvasActions inhaltsbasiert dedupliziert. Die Canvas-Schreib-Flags
        // lösen wir, damit die finale Runde das Canvas autoritativ (neu) schreiben kann.
        if (assistantContent.includes('</stream_reset>')) {
          assistantContent = assistantContent.replace(/[\s\S]*<\/stream_reset>/, '');
          shownCanvasActions.delete('coach_canvas');
          shownCanvasActions.delete('trigger_canvas');
        }

        // Raw content keeps <options> etc. for OptionsCard; MessageBubble strips for display.
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m)
        );
      }

      const aborted = abortControllerRef.current?.signal.aborted || activeTurnRef.current !== turnId;
      const rawAssistantContent = assistantContent;
      const strippedAssistantContent = stripInternalTags(assistantContent);
      setMessages(prev =>
        prev.map(m => m.id === assistantId ? { ...m, content: rawAssistantContent } : m)
      );
      if (strippedAssistantContent.trim()) {
        await saveMessage(sessionId, 'assistant', strippedAssistantContent);
      } else if (aborted) {
        setMessages(prev => prev.filter(m => m.id !== assistantId));
      }

      if (aborted) {
        logSync('canvas', 'skip', 'turn aborted — skip post-stream');
        return;
      }

      // Coach text is complete — unlock input; canvas/memory/phase sync runs in background.
      streamReaderRef.current = null;
      if (activeTurnRef.current === turnId) {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }

      const runPostTurnSync = async () => {
        let canvasSnapshot = streamCanvasData;
        try {
          if (coachWritesCanvas) {
            logSync('canvas', 'evaluate', 'auto_sync skipped — coach writes canvas (diagnose)');
          } else if (!shownCanvasActions.has('trigger_canvas')) {
            if (canvasEval.eligible && !canvasWorker.current) {
              logSync('canvas', 'invoke', 'auto_sync (no tag in stream)');
              startCanvasWorker('auto_sync');
            } else if (!canvasWorker.current) {
              logSync('canvas', 'skip', 'auto_sync not run', {
                reason: canvasEval.reason,
                detail: canvasEval.detail,
              });
              void appendCoachStatusExplanation(sessionId, canvasEval.reason, chatPhase, canvasSnapshot);
            }
          } else {
            logSync('canvas', 'evaluate', 'auto_sync skipped — tag already triggered worker');
          }

          if (detectCompletedPhase(rawAssistantContent, chatPhase)) {
            const prepKey = `${sessionId}:${chatPhase}`;
            const gate = canAdvanceFromPhase(chatPhase, canvasSnapshot, {
              coachSignaledComplete: true,
            });
            if (!gate.ok) {
              logSync('canvas', 'skip', `phase_complete blocked: ${gate.reason}`, { phase: chatPhase });
            }
            if (gate.ok && !phasePrepTriggeredForRef.current.has(prepKey)) {
              phasePrepTriggeredForRef.current.add(prepKey);
              await prepareNextPhaseRef.current?.(false);
            }
          }

          if (isHiddenInit) {
            logSync('memory', 'skip', 'hidden init — no memory extract');
          } else if (!assistantContent.trim()) {
            logSync('memory', 'skip', 'empty assistant reply');
          } else if (sessionId) {
            logSync('memory', 'invoke', 'POST /api/memory-update', {
              sessionId,
              userChars: (content || '').length,
              assistantChars: assistantContent.length,
            });
            const memAid = addAction('memory_update', 'Aktualisiere Gesprächs-Memory...');
            await fetch('/api/memory-update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId,
                currentMemory: sessionMemory,
                newMessage: `User: ${content}\n\nAssistant: ${assistantContent}`,
              }),
            })
              .then(async res => {
                const data = await res.json().catch(() => ({}));
                const status = data.status || (res.ok ? 'unknown' : 'error');
                const reason = data.reason || data.error || res.statusText;
                if (status === 'updated' && data.memory) {
                  logSync('memory', 'success', 'memory updated', {
                    chars: data.memory.length,
                    reason,
                  });
                  setSessionMemory(data.memory);
                  completeAction(memAid, 'Memory aktualisiert');
                } else if (status === 'unchanged') {
                  logSync('memory', 'skip', reason === 'no_new_facts' ? 'no new facts in turn' : 'unchanged', {
                    reason,
                  });
                  completeAction(memAid, `Memory: ${reason === 'no_new_facts' ? 'keine neuen Fakten' : 'unverändert'}`);
                } else if (status === 'skipped') {
                  logSync('memory', 'skip', 'API skipped', { reason });
                  completeAction(memAid, `Memory übersprungen (${reason})`);
                } else {
                  logSync('memory', 'fail', 'API error', { reason, status });
                  failAction(memAid, `Memory-Fehler (${reason})`);
                }
              })
              .catch(err => {
                logSync('memory', 'fail', 'network error', { error: String(err) });
                failAction(memAid, 'Memory-Fehler (Netzwerk)');
              });
          }

          if (
            chatPhase === 'umsetzung' ||
            assistantContent.includes('<request_credential>') ||
            assistantContent.includes('<deploy_workflow>')
          ) {
            await processPhase4Tags(assistantContent, canvasSnapshot, projId);
          }

          const pendingCanvasWorker = canvasWorker.current;
          if (pendingCanvasWorker) {
            await pendingCanvasWorker.catch(() => {});
            if (projId) {
              const fresh = await loadProjectCanvas(projId);
              if (fresh) canvasSnapshot = withSessionPhase(fresh, chatPhase);
            }
          } else if (projId) {
            const existingPc = await loadProjectCanvas(projId);
            const progressIdx = Math.max(
              phaseIndex(existingPc?.phase || chatPhase),
              phaseIndex(chatPhase)
            );
            const progressPhase = PHASE_ORDER[progressIdx] || normalizePhase(chatPhase);
            // Falls der Server zwischenzeitlich gebaut hat (build_workflow), hat existingPc
            // mehr Workflows als unser Snapshot → existingPc als Basis, sonst überschreiben
            // wir die gerade gebaute Deploy-Karte mit einem veralteten Stand.
            const existingWfCount = existingPc?.workflows?.length ?? 0;
            const snapshotWfCount = canvasSnapshot.workflows?.length ?? 0;
            const saveBase = existingPc && existingWfCount > snapshotWfCount ? existingPc : canvasSnapshot;
            if (saveBase !== canvasSnapshot) {
              canvasSnapshot = withSessionPhase(saveBase, chatPhase);
            }
            await saveProjectCanvas(projId, {
              ...saveBase,
              phase: normalizePhase(progressPhase),
            });
          }
          // Legacy session canvas — only when no project-bound canvas exists
          if (!projId) {
            await saveCanvas(sessionId, canvasSnapshot);
          }
        } catch (syncErr) {
          console.error('Post-turn sync error:', syncErr);
        }
      };

      void runPostTurnSync();

    } catch (err: unknown) {
      const errName = err instanceof Error ? err.name : '';
      const errMessage = err instanceof Error ? err.message : '';
      if (errName === 'AbortError') {
        console.log('Stream aborted');
      } else {
        console.error('Chat API Error:', err);
        // Netzwerk-/Offline-Fehler dem Nutzer als Toast zeigen (statt nur Konsole).
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          setNetToast('Keine Internetverbindung — bitte erneut senden.');
        } else if (errName === 'TypeError' || /fetch|network|Failed to fetch/i.test(errMessage)) {
          setNetToast('Verbindung fehlgeschlagen — bitte erneut senden.');
        }
      }
    } finally {
      streamReaderRef.current = null;
      if (activeTurnRef.current === turnId) {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
      // Release the welcome lock so switching to this session again (if it has no messages) doesn't get stuck
      // (won't re-fire anyway since isWelcomeSent DB flag is now true)
      if (isHiddenInit && sessionId) welcomeInProgressRef.current.delete(sessionId);
    }
  }, [messages, isStreaming, onboarding, currentSessionId, userId, refreshSessions, canvasData, sessionPhase, sessions, currentProject, addAction, completeAction, failAction, clearActions, processPhase4Tags, withSessionPhase, pendingAttachments, appendCoachStatusExplanation, scheduleStrategyCanvasUpdate]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      if (session?.user) setUserId(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ---- Phasen-Feedback-Popup: zeigen, sobald eine Phase abgeschlossen ist ----
  // Triggert auf <phase_complete> in der letzten Assistant-Nachricht (gleiche
  // Erkennung wie das Banner) und greift auch für 'umsetzung' (Abschluss-Feedback).
  // Dedupe: pro Phase nur einmal pro Session-Lebenszeit + DB-Check pro Projekt.
  useEffect(() => {
    if (isLoadingSession || !currentProject?.id) return;
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return;
    const completed = detectCompletedPhase(lastAssistant.content, sessionPhase);
    if (!completed) return;

    const key = `${currentProject.id}:${completed}`;
    if (feedbackShownRef.current.has(key)) return;
    feedbackShownRef.current.add(key);

    let cancelled = false;
    (async () => {
      const already = await hasPhaseFeedback(currentProject.id, completed);
      if (cancelled || already) return;
      setPhaseFeedback({ phase: completed, isFinal: completed === 'umsetzung' });
    })();
    return () => { cancelled = true; };
  }, [messages, sessionPhase, currentProject?.id, isLoadingSession]);

  // ---- Realtime Canvas Subscription ----
  useEffect(() => {
    if (!currentProject?.id) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`canvas_updates_${currentProject.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'project_canvas', filter: `project_id=eq.${currentProject.id}` },
        (payload) => {
           console.log('[Realtime] Received canvas update:', payload.new.data);
           setCanvasData(withSessionPhase(payload.new.data as CanvasData, sessionPhase));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'project_canvas', filter: `project_id=eq.${currentProject.id}` },
        (payload) => {
           console.log('[Realtime] Received canvas insert:', payload.new.data);
           setCanvasData(withSessionPhase(payload.new.data as CanvasData, sessionPhase));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentProject?.id, sessionPhase, withSessionPhase]);

  // ---- Load a specific session ----
  // Queries project directly from Supabase so it never relies on stale sessions state.
  const switchToSession = async (sessionId: string) => {
    lastCoachStatusKeyRef.current = null;
    setIsLoadingSession(true);
    const supabase = createSupabaseBrowserClient();
    try {
      const [msgs, ob, sessionRes, welcomeSent] = await Promise.all([
        loadSessionMessages(sessionId),
        loadSessionOnboarding(sessionId),
        supabase.from('sessions').select('project_id, phase, memory').eq('id', sessionId).maybeSingle(),
        isWelcomeSent(sessionId)
      ]);
      if (!sessionRes.data) {
        console.warn('[chat] Session nicht zugreifbar (RLS):', sessionId);
        return;
      }

      setMessages(msgs.filter(m => !(m.role === 'user' && isHiddenSystemMessage(m.content))));
      if (ob) setOnboarding(ob);
      setSessionMemory(sessionRes.data.memory || '');
      setCurrentSessionId(sessionId);

      // Legacy-tolerant: alte Sessions können noch phase='plan' tragen.
      const phase = normalizePhase(sessionRes.data.phase);
      setSessionPhase(phase);

      // Load the project directly — no stale closure risk
      const projectId = sessionRes.data?.project_id;
      if (projectId) {
        const [proj, projectCanvas] = await Promise.all([
          supabase.from('projects').select('id, name').eq('id', projectId).maybeSingle(),
          loadProjectCanvas(projectId),
        ]);
        setCurrentProject(proj.data ? { id: proj.data.id, name: proj.data.name } : null);
        if (projectCanvas) {
          const sessionPhaseIdx = phaseIndex(phase);
          const projectPhaseIdx = phaseIndex(projectCanvas.phase);
          let merged = projectCanvas;
          if (sessionPhaseIdx > projectPhaseIdx) {
            merged = { ...projectCanvas, phase };
            saveProjectCanvas(projectId, merged).catch(console.error);
          }
          if (phase === 'umsetzung') {
            merged = healUmsetzungCanvas(merged);
            if (merged !== projectCanvas) {
              saveProjectCanvas(projectId, merged).catch(console.error);
            }
          }
          setCanvasData(withSessionPhase(merged, phase));
          if (merged.workflow_step_configs) setWorkflowStepConfigs(merged.workflow_step_configs);
        } else {
          const sessionCanvas = await loadSessionCanvas(sessionId);
          setCanvasData(withSessionPhase(sessionCanvas || emptyCanvas, phase));
          if (sessionCanvas?.workflow_step_configs) setWorkflowStepConfigs(sessionCanvas.workflow_step_configs);
        }
      } else {
        setCurrentProject(null);
        const sessionCanvas = await loadSessionCanvas(sessionId);
        setCanvasData(withSessionPhase(sessionCanvas || emptyCanvas, phase));
        if (sessionCanvas?.workflow_step_configs) setWorkflowStepConfigs(sessionCanvas.workflow_step_configs);
      }

      setPreparedNextSessionId(null);
      const phaseIdx = phaseIndex(phase);
      if (projectId && phaseIdx >= 0 && phaseIdx < PHASE_ORDER.length - 1) {
        const nextPh = PHASE_ORDER[phaseIdx + 1];
        const { data: nextSess } = await supabase
          .from('sessions')
          .select('id')
          .eq('project_id', projectId)
          .eq('phase', nextPh)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (nextSess?.id) setPreparedNextSessionId(nextSess.id);
      }

      if (shouldAutoKickoffSession(msgs, welcomeSent)) {
        setTimeout(() => {
          const kick = getSessionKickoff(phase, ob?.intro_message);
          sendMessage(kick.content, kick.hidden, [], sessionId, ob || undefined);
        }, 500);
      }
    } catch (err) {
      console.error('Error loading session:', err);
    } finally {
      setIsLoadingSession(false);
    }
  };

  // ---- Auth & Onboarding effect ----
  // Declared after switchToSession so the mount effect references it post-declaration.
  useEffect(() => {
    const initAuth = async () => {
      setIsLoadingSession(true);
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.push('/onboarding');
        return;
      }

      setUserId(session.user.id);
      setAuthUser(session.user);

      const pending = localStorage.getItem('pending_onboarding');
      if (pending) {
        try {
          const obData = JSON.parse(pending);
          setOnboarding(obData);
          localStorage.removeItem('pending_onboarding');

          // Ensure a default project exists (idempotent) and migrate any orphaned sessions
          const newProjectId = await ensureDefaultProject(session.user.id);

          const newId = await createSession(obData, session.user.id, 'diagnose', undefined, undefined, newProjectId);
          setCurrentSessionId(newId);
          await refreshSessions();
          await switchToSession(newId);

        } catch (e) {
          console.error(e);
        } finally {
          setIsLoadingSession(false);
        }
      } else {
         const list = await refreshSessions();
         const targetId = searchParams.get('id');
         if (targetId && list.some(s => s.id === targetId)) {
            await switchToSession(targetId);
         } else if (targetId) {
            console.warn('[chat] ?id= gehört nicht zum Account, Fallback:', targetId);
            if (list.length > 0) await switchToSession(list[0].id);
            else setIsLoadingSession(false);
         } else if (list.length > 0) {
            await switchToSession(list[0].id);
         } else {
            setIsLoadingSession(false);
         }
      }
    };
    initAuth();
  }, [router]); // Only run on mount

  const prepareNextPhase = useCallback(async (switchAfter = true) => {
    if (!currentSessionId || !userId || !currentProject || isPreparingNextPhase) return;

    const phase = normalizePhase(
      sessions.find(s => s.id === currentSessionId)?.phase || sessionPhase,
    );
    const currentIndex = phaseIndex(phase);
    if (currentIndex >= PHASE_ORDER.length - 1) return;

    const nextPhase = PHASE_ORDER[currentIndex + 1];
    const projectSessions = sessions.filter(s => s.project_id === currentProject.id);
    const existing = projectSessions.find(s => s.phase === nextPhase);
    if (existing) {
      setPreparedNextSessionId(existing.id);
      if (switchAfter) await switchToSession(existing.id);
      return;
    }

    setIsPreparingNextPhase(true);
    const summaryActionId = addAction('phase_summary', `Fasse ${PHASE_LABELS[phase]} zusammen...`);

    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, phase, canvas: withSessionPhase(canvasData, phase) }),
      });
      const { summary, chatTitle } = await res.json();

      if (chatTitle?.trim()) {
        await updateSessionTitle(currentSessionId, chatTitle.trim());
      }

      completeAction(summaryActionId, `${PHASE_LABELS[phase]} zusammengefasst`);

      const memoryActionId = addAction('memory_save', 'Speichere Projekt-Wissen...');
      await saveProjectMemory(currentProject.id, phase, summary);
      completeAction(memoryActionId, 'Projekt-Wissen gespeichert');

      // Strategie mit der Phasen-Zusammenfassung fortschreiben (fire-and-forget).
      postStrategyUpdate(currentProject.id, 'phase_transition', phase, summary);

      const nextCanvasData =
        nextPhase === 'umsetzung'
          ? splitPlansForUmsetzung({ ...canvasData, phase: nextPhase as CanvasData['phase'] })
          : { ...canvasData, phase: nextPhase as CanvasData['phase'] };
      const canvasActionId = addAction('canvas_update', 'Aktualisiere Projekt-Canvas...');
      await saveProjectCanvas(currentProject.id, nextCanvasData);
      setCanvasData(nextCanvasData);
      completeAction(canvasActionId, 'Projekt-Canvas aktualisiert');

      const prepActionId = addAction('phase_prepare', `Bereite ${PHASE_LABELS[nextPhase]} vor...`);
      const updatedOnboarding = { ...(onboarding || {}), memory: summary } as OnboardingData;

      // Doppelte Chats verhindern: frisch aus der DB prüfen, ob inzwischen (anderer
      // Tab / Auto-Prep parallel) schon eine Session für die nächste Phase existiert.
      const freshList = await refreshSessions();
      const freshExisting = freshList.find(
        s => s.project_id === currentProject.id && s.phase === nextPhase,
      );
      if (freshExisting) {
        completeAction(prepActionId, `${PHASE_LABELS[nextPhase]} bereits vorbereitet`);
        setPreparedNextSessionId(freshExisting.id);
        if (switchAfter) await switchToSession(freshExisting.id);
        return;
      }

      const newSessionId = await createSession(
        updatedOnboarding,
        userId,
        nextPhase,
        summary,
        nextCanvasData,
        currentProject.id
      );
      await refreshSessions();
      completeAction(prepActionId, `${PHASE_LABELS[nextPhase]} vorbereitet`);
      setPreparedNextSessionId(newSessionId);
      if (switchAfter) await switchToSession(newSessionId);
    } catch (err) {
      console.error('Error preparing next phase:', err);
      failAction(summaryActionId);
    } finally {
      setIsPreparingNextPhase(false);
    }
  }, [
    currentSessionId,
    userId,
    currentProject,
    isPreparingNextPhase,
    canvasData,
    sessionPhase,
    sessions,
    messages,
    onboarding,
    addAction,
    completeAction,
    failAction,
    refreshSessions,
    withSessionPhase,
    postStrategyUpdate,
  ]);

  useEffect(() => {
    prepareNextPhaseRef.current = prepareNextPhase;
  }, [prepareNextPhase]);

  // ---- Create a new session ----
  const handleNewChat = useCallback(async () => {
    const ob = onboarding || { ziel: '', ki_erfahrung: '', wer_setzt_um: '', hindernis: '', branche: '', tempo: '', unternehmensgroesse: '' };
    if (!userId || !currentProject) return;
    try {
      const currentPhase =
        sessions.find(s => s.id === currentSessionId)?.phase || sessionPhase || 'diagnose';
      const newId = await createSession(ob, userId, currentPhase, undefined, undefined, currentProject.id);
      setCurrentSessionId(newId);
      setSessionPhase(currentPhase);
      setMessages([]);
      setCanvasData(prev => withSessionPhase(prev, currentPhase));
      // Do NOT reset the canvas to emptyCanvas. We want to keep the current canvas data.
      await refreshSessions();
      
      // Auto-send welcome for new chat
      setTimeout(() => {
        const kick = getSessionKickoff(currentPhase, ob.intro_message);
        sendMessage(kick.content, kick.hidden, [], newId, ob);
      }, 500);
      
    } catch (err) {
      console.error('Error creating session:', err);
    }
  }, [onboarding, userId, currentProject, currentSessionId, sessionPhase, sessions, refreshSessions, sendMessage, withSessionPhase]);

  // ---- Project rename ----
  const handleRenameProject = useCallback(async (newName: string) => {
    if (!currentProject) return;
    await updateProjectName(currentProject.id, newName);
    setCurrentProject(prev => prev ? { ...prev, name: newName } : prev);
    await refreshSessions();
  }, [currentProject, refreshSessions]);

  // ---- Project delete ----
  const handleDeleteProject = useCallback(async () => {
    if (!currentProject) return;
    await deleteProject(currentProject.id);
    router.push('/dashboard');
  }, [currentProject, router]);

  // ---- Project create ----
  const handleCreateProject = useCallback(async () => {
    if (!userId) return;
    setPendingWelcome(null); // Clear any stale pending welcome
    try {
      const ob = onboarding || { ziel: '', ki_erfahrung: '', wer_setzt_um: '', hindernis: '', branche: '', tempo: '', unternehmensgroesse: '' };
      const newProjectId = await createProject(userId, 'Neues Projekt');
      const newId = await createSession(ob, userId, 'diagnose', undefined, undefined, newProjectId);
      setCurrentProject({ id: newProjectId, name: 'Neues Projekt' });
      setCurrentSessionId(newId);
      setMessages([]);
      setCanvasData(emptyCanvas);
      await refreshSessions();
      setTimeout(() => {
        sendMessage(getHiddenInitMessage('diagnose'), true, [], newId, ob);
      }, 400);
    } catch (err) {
      console.error('Error creating project:', err);
    }
  }, [userId, onboarding, refreshSessions, sendMessage]);

  // Phase 4 abgeschlossen → aktuelle Phase zusammenfassen und ins Projekt-Memory sichern (best effort).
  const summarizeUmsetzungToMemory = useCallback(async (): Promise<string> => {
    if (!currentProject) return sessionMemory || '';
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, phase: 'umsetzung', canvas: withSessionPhase(canvasData, 'umsetzung') }),
      });
      const j = await res.json();
      if (j?.summary?.trim()) {
        await saveProjectMemory(currentProject.id, 'umsetzung', j.summary.trim());
        return j.summary.trim();
      }
    } catch (e) {
      console.error('Error summarizing umsetzung:', e);
    }
    return sessionMemory || '';
  }, [currentProject, messages, canvasData, sessionMemory, withSessionPhase]);

  // ---- Phase-4-Abschluss (a): weiteren Workflow bauen → frische Phase-3-Session im SELBEN Projekt ----
  const startAnotherWorkflow = useCallback(async () => {
    if (!userId || !currentProject || !currentSessionId || isNextStepBusy) return;
    setIsNextStepBusy(true);
    try {
      const summary = await summarizeUmsetzungToMemory();
      const hint = `${summary}\n\n--- Neuer Workflow ---\nDie bisherigen Workflows laufen bereits. Jetzt geht es um einen NEUEN Workflow im selben Unternehmen. Nutze das bekannte Firmen-, Tool- und Umsetzer-Wissen, aber frag den Nutzer, welche neue Automatisierung er möchte, und entwirf sie frisch (kein Re-Diagnose von vorn).`;
      // Frische Plan-Oberfläche (gemergte Analyse): Firma/Tools/Pain Points/gebaute Workflows behalten, nur Plan-Skizzen leeren.
      const seed: CanvasData = { ...canvasData, workflow_plans: [], phase: 'analyse' };
      await saveProjectCanvas(currentProject.id, seed);
      const ob = { ...(onboarding || {}), memory: hint } as OnboardingData;
      const newId = await createSession(ob, userId, 'analyse', hint, seed, currentProject.id);
      await refreshSessions();
      await switchToSession(newId);
    } catch (err) {
      console.error('Error starting another workflow:', err);
    } finally {
      setIsNextStepBusy(false);
    }
  }, [userId, currentProject, currentSessionId, isNextStepBusy, canvasData, onboarding, refreshSessions, summarizeUmsetzungToMemory]);

  // ---- Phase-4-Abschluss (b): anderen Unternehmensbereich → NEUES Projekt (Firma + Umsetzer übernehmen) ----
  const startNewAreaProject = useCallback(async () => {
    if (!userId || !currentProject || isNextStepBusy) return;
    setIsNextStepBusy(true);
    try {
      await summarizeUmsetzungToMemory();
      const newName = `${currentProject.name} — weiterer Bereich`;
      const newProjectId = await createProject(userId, newName);
      // Seed: nur Firma übernehmen, der Rest startet leer.
      const seed: CanvasData = {
        ...emptyCanvas,
        company: canvasData.company,
      };
      const hint = `Bekannte Firma, neuer Bereich. Firmen-Infos sind bereits bekannt (siehe Canvas/Historie). Bestätige zu Beginn nur kurz, ob das alles noch passt, statt alles neu abzufragen, und finde dann die Zeitfresser im NEUEN Unternehmensbereich.`;
      const ob = { ...(onboarding || {}), memory: hint } as OnboardingData;
      const newId = await createSession(ob, userId, 'diagnose', hint, seed, newProjectId);
      setCurrentProject({ id: newProjectId, name: newName });
      setCurrentSessionId(newId);
      setMessages([]);
      setCanvasData(seed);
      await refreshSessions();
      setTimeout(() => {
        sendMessage(getHiddenInitMessage('diagnose'), true, [], newId, ob);
      }, 400);
    } catch (err) {
      console.error('Error starting new area project:', err);
    } finally {
      setIsNextStepBusy(false);
    }
  }, [userId, currentProject, isNextStepBusy, canvasData, onboarding, refreshSessions, sendMessage, summarizeUmsetzungToMemory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Quick-reply options: derived from the latest assistant message's <options> tag.
  // Disappears automatically once the user replies (a user message becomes last)
  // or when explicitly dismissed. Available in all phases (coach decides when to offer).
  const activeOptions = useMemo(() => {
    if (isStreaming) return null;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || last.id === dismissedOptionsId) return null;
    const parsed = parseOptionsTag(last.content);
    return parsed ? { options: parsed, messageId: last.id } : null;
  }, [messages, isStreaming, sessionPhase, dismissedOptionsId]);

  const stopChat = () => {
    activeTurnRef.current += 1;
    abortControllerRef.current?.abort();
    streamReaderRef.current?.cancel().catch(() => {});
    abortControllerRef.current = null;
    streamReaderRef.current = null;
    setIsStreaming(false);
  };

  const handleEditMessage = async (id: string, newContent: string) => {
     if (isStreaming || !currentSessionId) return;
     
     const index = messages.findIndex(m => m.id === id);
     if (index === -1) return;

     const newMessages = messages.slice(0, index);
     
     // Optionally delete later messages from supabase here if we want persistence sync
     // For now, sendMessage will append from this new point.
     await sendMessage(newContent, false, newMessages);
  };

  const handleNextPhase = async () => {
    const currentIndex = phaseIndex(sessionPhase);
    if (currentIndex >= PHASE_ORDER.length - 1 || !currentSessionId || !currentProject) return;

    const nextPhase = PHASE_ORDER[currentIndex + 1];
    if (preparedNextSessionId) {
      await switchToSession(preparedNextSessionId);
      return;
    }

    const projectSessions = sessions.filter(s => s.project_id === currentProject.id);
    const nextSession = projectSessions.find(s => s.phase === nextPhase);
    if (nextSession) {
      await switchToSession(nextSession.id);
      return;
    }

    await prepareNextPhase(true);
  };

  // DEV ONLY: jump to a specific phase without needing <phase_complete>.
  // Re-uses the existing session for that phase if already prepared, otherwise creates one.
  const handleDevSkipToPhase = async (targetPhase: string) => {
    if (!userId || !currentProject) return;

    // Re-use existing session for target phase if already prepared
    const projectSessions = sessions.filter(s => s.project_id === currentProject.id);
    const existing = projectSessions.find(s => s.phase === targetPhase);
    if (existing) { await switchToSession(existing.id); return; }

    // Create a fresh session for the target phase carrying current canvas
    const ob = onboarding || { ziel: '', ki_erfahrung: '', wer_setzt_um: '', hindernis: '', branche: '', tempo: '', unternehmensgroesse: '' };
    const targetCanvas = { ...canvasData, phase: targetPhase as CanvasData['phase'] };
    const newId = await createSession(ob as OnboardingData, userId, targetPhase, '[dev skip]', targetCanvas, currentProject.id);
    await saveProjectCanvas(currentProject.id, targetCanvas);
    await refreshSessions();
    await switchToSession(newId);
  };

  const handleResetCurrentPhase = async () => {
    if (!currentSessionId || !currentProject || isResettingPhase || isStreaming) return;

    const phaseLabel = PHASE_LABELS[sessionPhase] || sessionPhase;
    if (
      !window.confirm(
        `Phase „${phaseLabel}“ zurücksetzen?\n\nChat, Session-Memory, Projekt-Memory und Canvas-Inhalte dieser Phase werden gelöscht. Frühere Phasen bleiben erhalten.`,
      )
    ) {
      return;
    }

    setIsResettingPhase(true);
    try {
      const res = await fetch('/api/dev/reset-phase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          projectId: currentProject.id,
          phase: sessionPhase,
          canvas: withSessionPhase(canvasData, sessionPhase),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = typeof err.error === 'string' ? err.error : `HTTP ${res.status}`;
        throw new Error(detail || 'Reset fehlgeschlagen');
      }

      const { canvas: resetCanvas } = await res.json();
      const nextCanvas = withSessionPhase(resetCanvas as CanvasData, sessionPhase);

      setMessages([]);
      setSessionMemory('');
      setDismissedOptionsId(null);
      setCanvasData(nextCanvas);
      canvasDataRef.current = nextCanvas;
      setPreparedNextSessionId(null);
      setAgentActions([]);
      setWorkflowStepConfigs({});
      setDeployedWorkflowIds({});
      deployedWorkflowIdsRef.current = {};
      phasePrepTriggeredForRef.current.delete(currentSessionId);
      welcomeInProgressRef.current.delete(currentSessionId);
      lastCoachStatusKeyRef.current = null;

      const kick = getSessionKickoff(sessionPhase, onboarding?.intro_message);
      setTimeout(() => {
        sendMessage(kick.content, kick.hidden, [], currentSessionId, onboarding || undefined);
      }, 400);
    } catch (err) {
      console.error('[dev] phase reset failed:', err);
      window.alert(err instanceof Error ? err.message : 'Reset fehlgeschlagen');
    } finally {
      setIsResettingPhase(false);
    }
  };

  const handlePhaseCircleClick = async (clickedPhase: string) => {
     if (!currentProject) return;
     const projectSessions = sessions.filter(s => s.project_id === currentProject.id);
     const phaseSession = pickLatestSessionForPhase(projectSessions, clickedPhase);
     if (phaseSession) {
        await switchToSession(phaseSession.id);
     }
  };

  const chatBackgroundStatus = getChatBackgroundStatus(agentActions, {
    isPreparingNextPhase,
    sessionPhase,
  });

  const projectSessions = currentProject
    ? sessions.filter(s => s.project_id === currentProject.id)
    : sessions;

  const projectSessionsByRecency = [...projectSessions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  /** Canvas startet rechts neben dem schwebenden Chat (left-6 + Breite); bei geschlossenem Chat volle Breite. */
  const canvasInsetLeft = !isMobile && !isClosed ? (isMaximized ? 624 : 384) : 0;

  const sessionsByPhase = projectSessions.reduce((acc, session) => {
    const phase = normalizePhase(session.phase);
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(session);
    return acc;
  }, {} as Record<string, SessionSummary[]>);

  if (isLoadingSession && !currentSessionId && sessions.length === 0) {
      return <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center text-gray-500">Lade Arbeitsbereich...</div>;
  }

  const mobileViewSwitch = (
    <div className="shrink-0 flex justify-center border-t border-gray-100 bg-white px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="bg-gray-50 border border-gray-200 shadow-sm rounded-full p-1 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setMobileView('chat')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            mobileView === 'chat' ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <MessageCircle size={16} /> Chat
        </button>
        <button
          type="button"
          onClick={() => setMobileView('canvas')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            mobileView === 'canvas' ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <Activity size={16} /> Canvas
        </button>
      </div>
    </div>
  );

  // Live-Indikator fürs Canvas: an, solange eine Canvas-bezogene Aktion läuft
  // (Worker-Strukturierung, Workflow-Build/-Plan/-Edit). So sieht der Nutzer, dass
  // sich das Canvas gleich ändert, und denkt während der Hintergrund-Latenz nicht,
  // es sei eingefroren.
  const isCanvasUpdating = agentActions.some(
    a =>
      a.status === 'running' &&
      (a.type === 'canvas_update' ||
        a.type === 'create_workflow_plan' ||
        a.type === 'build_workflow' ||
        a.type === 'edit_workflow'),
  );

  const roadmapCanvasEl = (
    <RoadmapCanvas
      data={canvasData}
      isUpdating={isCanvasUpdating}
      currentPhase={normalizePhase(sessions.find(s => s.id === currentSessionId)?.phase || canvasData.phase)}
      maxReachedPhase={maxReachedPhase}
      onPhaseClick={handlePhaseCircleClick}
      onSendMessage={text => {
        void sendMessage(text);
        if (isMobile) setMobileView('chat');
      }}
      projectId={currentProject?.id}
      workflowStepConfigs={workflowStepConfigs}
      onStepConfigSave={handleStepConfigSave}
      deployedWorkflowIds={deployedWorkflowIds}
      onWorkflowDeployed={(workflowId, dbId) => setDeployedWorkflowIds(prev => ({ ...prev, [workflowId]: dbId }))}
      openDeployWorkflowId={openDeployWorkflowId}
      onDeployModalOpened={(id) => setOpenDeployWorkflowId(prev => (prev === id ? null : prev))}
      onWorkflowPersist={handleWorkflowPersist}
    />
  );

  return (
    <div className={`flex w-full bg-slate-50 bg-grid overflow-hidden relative font-sans ${isMobile ? 'h-[100dvh] max-h-[100dvh]' : 'h-screen'}`}>
      
      {/* Sidebar background overlay */}
      <div className={`fixed inset-0 bg-transparent z-10 transition-opacity ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsSidebarOpen(false)}></div>

      {/* Chat panel — mobile: full viewport; desktop: floating left */}
      {((!isMobile && !isClosed) || (isMobile && mobileView === 'chat')) && (
      <div className={
        isMobile
          ? 'absolute inset-0 z-30 bg-white flex flex-col min-h-0 h-full max-h-full overflow-hidden relative'
          : `absolute top-6 left-6 bottom-6 ${isMaximized ? 'w-[600px] z-30' : 'w-[360px] z-20'} bg-white rounded-2xl shadow-xl flex flex-col border border-gray-200 overflow-hidden transition-all duration-300 relative`
      }>

        {/* Inner Menu Overlay */}
        <AnimatePresence>
         {isSidebarOpen && (
           <motion.div
             initial={{ x: '-100%' }}
             animate={{ x: 0 }}
             exit={{ x: '-100%' }}
             transition={{ type: 'spring', damping: 25, stiffness: 200 }}
             className="absolute inset-0 z-50 bg-white flex flex-col"
           >
             <div className="p-5 border-b border-gray-100 flex items-center justify-between">
               <div className="flex items-center gap-3">
                 <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white font-bold tracking-tight">K</span>
                 <span className="font-bold text-gray-800">Chats</span>
               </div>
               <button onClick={() => setIsSidebarOpen(false)} className="p-2 -mr-2 text-gray-400 hover:text-gray-700 transition-colors rounded-lg hover:bg-gray-100">
                 <X size={18} />
               </button>
             </div>

              <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
               <button onClick={() => { router.push('/dashboard'); setIsSidebarOpen(false); }} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-gray-600 hover:bg-gray-50`}>
                 <HomeIcon size={18} /> Eingangsbereich
               </button>

               <div className="h-px bg-gray-100 my-3"></div>

               <button onClick={() => { handleNewChat(); setIsSidebarOpen(false); }} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-colors">
                 <Plus size={18} /> Neuer Chat
               </button>

               <div className="h-px bg-gray-100 my-3"></div>

               {/* Project controls (moved out of the old top-right ProjectHeader bar) */}
               {!isLoadingSession && currentProject && (
                 <>
                   <div className="px-1">
                     <ProjectMenu
                       currentProject={currentProject}
                       canvasPhase={sessionPhase}
                       sessions={sessions}
                       onPhaseSelect={handlePhaseCircleClick}
                       onRename={handleRenameProject}
                       onDelete={handleDeleteProject}
                       onCreate={handleCreateProject}
                       onNavigate={() => setIsSidebarOpen(false)}
                     />
                   </div>
                   <div className="h-px bg-gray-100 my-3"></div>
                 </>
               )}

               {PHASE_ORDER.map(phase => {
                 const phaseSessions = sessionsByPhase[phase] || [];
                 if (phaseSessions.length === 0) return null;
                 return (
                   <div key={phase} className="mb-3">
                     <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                       {PHASE_LABELS[phase]}
                     </div>
                     {phaseSessions.map(s => (
                       <button
                         key={s.id}
                         onClick={() => { switchToSession(s.id); setIsSidebarOpen(false); }}
                         className={`w-full text-left px-3 py-2 text-sm rounded-lg truncate transition-colors ${
                           s.id === currentSessionId
                             ? 'bg-indigo-50 text-indigo-700 font-medium'
                             : 'text-gray-600 hover:bg-gray-50'
                         }`}
                       >
                         {s.title || 'Neuer Chat'}
                       </button>
                     ))}
                   </div>
                 );
               })}
             </div>

             {accountDisplay && (
               <SidebarAccountOverview
                 account={accountDisplay}
                 onSettings={() => {
                   router.push('/dashboard');
                   setIsSidebarOpen(false);
                 }}
                 onLogout={handleLogout}
               />
             )}
           </motion.div>
         )}
        </AnimatePresence>

        {/* Chat Header */}
        <div className={`flex items-center justify-between border-b border-gray-100 bg-white shrink-0 ${isMobile ? 'px-4 py-3' : 'px-5 py-4'}`}>
          <div ref={historyMenuRef} className="flex items-center gap-3 text-gray-400 relative">
            <button type="button" onClick={openSidebar} className="hover:text-gray-700 transition-colors" title="Menü"><Menu size={18} /></button>
            <button
              type="button"
              onClick={() => setIsHistoryOpen(o => !o)}
              className={`flex items-center gap-1 transition-colors ${isHistoryOpen ? 'text-indigo-600' : 'hover:text-gray-700'}`}
              title="Chat-Verlauf"
              aria-expanded={isHistoryOpen}
              aria-haspopup="listbox"
            >
              <History size={17} />
              <ChevronDown size={13} className={`transition-transform ${isHistoryOpen ? 'rotate-180' : ''}`} />
            </button>
            {isHistoryOpen && (
               <div className="absolute top-8 left-0 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50 flex flex-col overflow-hidden">
                  <div className="shrink-0 py-2">
                    <button
                      type="button"
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      onClick={() => { handleNewChat(); setIsHistoryOpen(false); }}
                    >
                      <Plus size={16} /> Neuer Chat
                    </button>
                    <div className="h-px bg-gray-100 my-1" />
                    <div className="px-4 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Chat Historie</div>
                  </div>
                  <div
                    className="overflow-y-auto overscroll-contain max-h-[min(16rem,40vh)] pb-2"
                    role="listbox"
                    aria-label="Chat Historie"
                  >
                    {projectSessionsByRecency.length === 0 ? (
                      <p className="px-4 py-2 text-sm text-gray-400">Noch keine Chats</p>
                    ) : (
                      projectSessionsByRecency.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          role="option"
                          aria-selected={s.id === currentSessionId}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 truncate ${s.id === currentSessionId ? 'text-indigo-600 font-medium' : 'text-gray-600'}`}
                          onClick={() => { switchToSession(s.id); setIsHistoryOpen(false); }}
                        >
                          {s.title || 'Neuer Chat'}
                        </button>
                      ))
                    )}
                  </div>
               </div>
            )}
          </div>
          <span className="text-sm font-semibold text-gray-700">
            {PHASE_LABELS[sessionPhase] || 'Chat'}
          </span>
          <div className="flex items-center gap-3 text-gray-400">
            <button
               type="button"
               onClick={() => setIsDevModalOpen(true)}
               className="hover:text-indigo-600 transition-colors flex items-center gap-1 bg-indigo-50 text-indigo-500 px-2 py-0.5 rounded text-[10px] font-bold"
               title="Dev Context"
            >
               <Database size={12} />
               DEV
            </button>
            {!isMobile && (
              <>
                <button
                  type="button"
                  onClick={() => setMaximizeOverride(v => !(v ?? !isCompactDesktop))}
                  className="hover:text-gray-700 transition-colors"
                >
                   {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button type="button" onClick={() => setIsClosed(true)} className="hover:text-gray-700 transition-colors"><X size={18} /></button>
              </>
            )}
          </div>
        </div>

        {/* Collapsible chat history removed as per user request */}

        {/* DEV: phase-skip toolbar — only in development */}
        {process.env.NODE_ENV === 'development' && !isLoadingSession && currentProject && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-[11px] font-medium text-amber-700 shrink-0 flex-wrap">
            <span className="opacity-60">⚡ dev</span>
            {PHASE_ORDER.filter((_, i) => i !== phaseIndex(sessionPhase)).map(ph => (
              <button
                key={ph}
                onClick={() => handleDevSkipToPhase(ph)}
                className="px-2 py-0.5 rounded bg-amber-200 hover:bg-amber-300 transition-colors"
              >
                {ph === sessionPhase ? '↺' : phaseIndex(ph) > phaseIndex(sessionPhase) ? '→' : '←'} {PHASE_LABELS[ph]}
              </button>
            ))}
            <span className="opacity-40">|</span>
            <button
              type="button"
              onClick={handleResetCurrentPhase}
              disabled={!currentSessionId || isResettingPhase || isStreaming}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-200 hover:bg-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-red-900"
              title="Chat, Memory und Canvas der aktuellen Phase leeren"
            >
              {isResettingPhase ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              Phase zurücksetzen
            </button>
          </div>
        )}

        {/* Body — flex-1 + min-h-0 so messages scroll inside the viewport, not past it */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {isLoadingSession && (
              <div className="flex-1 flex items-center justify-center min-h-0">
                <div className="text-gray-400 text-sm">Lade Chat...</div>
              </div>
            )}

            {!isLoadingSession && (
              <ChatWindow
                messages={messages}
                onEdit={handleEditMessage}
                isStreaming={isStreaming}
                sessionId={currentSessionId}
                phase={sessions.find(s => s.id === currentSessionId)?.phase || sessionPhase || 'diagnose'}
                className={isMobile ? 'px-4 py-4' : undefined}
                injectBeforeLastAssistant={
                  agentActions.length > 0
                    ? <AgentActionsFeed actions={agentActions} inline />
                    : undefined
                }
              />
            )}

            {!isLoadingSession && currentSessionId && currentProject && (() => {
              const sPhase = sessionPhase;
              const sPhaseIndex = phaseIndex(sPhase);
              if (sPhaseIndex >= PHASE_ORDER.length - 1) return null;

              const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
              const hasPhaseComplete =
                !!lastAssistant && detectCompletedPhase(lastAssistant.content, sPhase);

              const nextPhase = PHASE_ORDER[sPhaseIndex + 1];
              const projectSessions = sessions.filter(s => s.project_id === currentProject.id);
              const hasNextSession =
                !!preparedNextSessionId ||
                projectSessions.some(s => s.phase === nextPhase);

              if (!hasPhaseComplete && !hasNextSession && !isPreparingNextPhase) return null;

              const currentPhaseLabel = PHASE_LABELS[sPhase];
              const nextPhaseLabel = PHASE_LABELS[nextPhase];

              return (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="shrink-0 px-4 sm:px-5 py-3 bg-indigo-50 border-t border-indigo-100 shadow-[0_-4px_20px_-10px_rgba(99,102,241,0.3)] z-10"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      {isPreparingNextPhase ? (
                        <>
                          <p className="text-xs text-indigo-700 font-bold uppercase tracking-wider flex items-center gap-2">
                            <Loader2 size={14} className="animate-spin shrink-0" />
                            Nächste Phase wird vorbereitet
                          </p>
                          <p className="text-sm text-indigo-800 mt-1.5 leading-snug">
                            Axantilo fasst <strong>{currentPhaseLabel}</strong> zusammen und richtet{' '}
                            <strong>{nextPhaseLabel}</strong> ein (Memory, Canvas, neue Session).
                            Das läuft im Hintergrund — du kannst weiter im Chat schreiben.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-indigo-700 font-bold uppercase tracking-wider flex items-center gap-2">
                            <span className="relative flex h-2 w-2 shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                            </span>
                            {currentPhaseLabel} abgeschlossen
                          </p>
                          <p className="text-sm text-indigo-700/90 mt-1">
                            {hasNextSession
                              ? `${nextPhaseLabel} ist bereit — tippe auf den Button, um fortzufahren.`
                              : `Sobald ${nextPhaseLabel} fertig vorbereitet ist, kannst du hier weitermachen.`}
                          </p>
                        </>
                      )}
                    </div>
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      disabled={isPreparingNextPhase || !hasNextSession}
                      className="shrink-0 w-full sm:w-auto bg-indigo-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow-md hover:bg-indigo-700 hover:shadow-lg transition-all flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed" 
                      onClick={handleNextPhase}
                    >
                      {isPreparingNextPhase ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Wird vorbereitet…
                        </>
                      ) : (
                        <>
                          {nextPhaseLabel} starten <ChevronRight size={14} />
                        </>
                      )}
                    </motion.button>
                  </div>
                </motion.div>
              );
            })()}

            {/* Phase-4-Abschluss: „Was kommt als Nächstes?" — weiterer Workflow (selbes Projekt) vs. neuer Bereich (neues Projekt) */}
            {!isLoadingSession && currentSessionId && currentProject && sessionPhase === 'umsetzung' && (() => {
              const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
              const done = !!lastAssistant && detectCompletedPhase(lastAssistant.content, 'umsetzung');
              if (!done && !isNextStepBusy) return null;
              return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="shrink-0 px-4 sm:px-5 py-3 bg-indigo-50 border-t border-indigo-100 shadow-[0_-4px_20px_-10px_rgba(99,102,241,0.3)] z-10"
                >
                  <p className="text-xs text-indigo-700 font-bold uppercase tracking-wider mb-2">Was kommt als Nächstes?</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={isNextStepBusy}
                      onClick={startAnotherWorkflow}
                      className="flex-1 bg-indigo-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow-md hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isNextStepBusy && <Loader2 size={14} className="animate-spin" />}
                      Weiteren Workflow bauen
                    </button>
                    <button
                      type="button"
                      disabled={isNextStepBusy}
                      onClick={startNewAreaProject}
                      className="flex-1 bg-white text-indigo-700 border border-indigo-200 text-sm font-semibold px-4 py-2.5 rounded-lg shadow-sm hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isNextStepBusy && <Loader2 size={14} className="animate-spin" />}
                      Anderen Bereich analysieren
                    </button>
                  </div>
                  <p className="text-xs text-indigo-700/70 mt-2">
                    Weiterer Workflow bleibt im selben Projekt (frische Planung). Anderer Bereich startet ein neues Projekt — Firma &amp; Umsetzer übernehme ich.
                  </p>
                </motion.div>
              );
            })()}

            {/* Netzwerk-/Offline-Toast */}
            <AnimatePresence>
              {netToast && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-xl"
                  role="alert"
                >
                  {netToast}
                </motion.div>
              )}
            </AnimatePresence>

            {!isLoadingSession && (
              <>
                {activeOptions && (
                  <div className={isMobile ? 'px-2' : 'px-4'}>
                    <OptionsCard
                      options={activeOptions.options}
                      onSelect={(label) => {
                        setDismissedOptionsId(activeOptions.messageId);
                        sendMessage(label);
                      }}
                      onCustomSubmit={(text) => {
                        setDismissedOptionsId(activeOptions.messageId);
                        sendMessage(text);
                      }}
                      onDismiss={() => setDismissedOptionsId(activeOptions.messageId)}
                    />
                  </div>
                )}
                <ChatInput
                  value={input}
                  onChange={setInput}
                  onSubmit={handleSubmit}
                  disabled={isStreaming}
                  isStreaming={isStreaming}
                  onStop={stopChat}
                  attachments={pendingAttachments}
                  onAttachmentsChange={setPendingAttachments}
                  sessionId={currentSessionId}
                  compact={isMobile}
                  backgroundStatus={chatBackgroundStatus}
                />
              </>
            )}
        </div>

        {isMobile && mobileViewSwitch}

        {/* Hilfe — schwebende Bubble unten rechts im Chat-Panel */}
        <button
          type="button"
          onClick={() => setIsSupportOpen(true)}
          className={`absolute z-20 flex items-center justify-center rounded-full border border-gray-200 bg-white text-indigo-600 shadow-lg transition-colors hover:border-indigo-200 hover:bg-indigo-50 ${
            isMobile ? 'bottom-[max(5.5rem,calc(5rem+env(safe-area-inset-bottom)))] right-4 w-11 h-11' : 'bottom-24 right-4 w-11 h-11'
          }`}
          title="Hilfe / Problem melden"
          aria-label="Hilfe / Problem melden"
        >
          <HelpCircle size={20} />
        </button>
      </div>
      )}

      {isMobile && mobileView === 'canvas' && (
        <div className="absolute inset-0 z-20 flex flex-col min-h-0 h-full max-h-full overflow-hidden bg-slate-50">
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pt-4 px-1">
            {roadmapCanvasEl}
          </div>
          {mobileViewSwitch}
        </div>
      )}

      {/* Floating Chat Reopen Button (desktop only — mobile uses the bottom switch) */}
      {!isMobile && isClosed && (
        <button
          onClick={() => setIsClosed(false)}
          className="absolute bottom-6 left-6 z-30 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-indigo-700 transition-colors"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* Canvas — füllt exakt den Bereich rechts vom Chat (absolute inset), nicht padding auf voller Breite */}
      {!isMobile && (
      <div
        className="absolute top-0 right-0 bottom-0 z-0 min-w-0 overflow-y-auto overflow-x-hidden transition-[left] duration-300 pt-6 pb-6 pl-6 pr-6"
        style={{ left: canvasInsetLeft }}
      >
        {roadmapCanvasEl}
      </div>
      )}

      {/* Fixed phase + project panel on the canvas (desktop only) */}
      {!isMobile && !isLoadingSession && currentProject && (
        <CanvasInfoPanel
          phase={sessionPhase}
          maxReachedPhase={maxReachedPhase}
          currentProject={currentProject}
          onPhaseClick={handlePhaseCircleClick}
          onRename={handleRenameProject}
        />
      )}

    {/* Phase 4: Credential Popup */}
    <AnimatePresence>
      {credentialRequest && currentProject && (
        <CredentialPopup
          key={credentialRequest.tool}
          tool={credentialRequest.tool}
          label={credentialRequest.label}
          type={credentialRequest.type}
          projectId={currentProject.id}
          onSaved={() => {
            setCredentialRequest(null);
            // Auto-confirm to bot that the credential is connected
            setTimeout(() => sendMessage(`✓ ${credentialRequest.label} verbunden`), 300);
          }}
          onClose={() => setCredentialRequest(null)}
        />
      )}
    </AnimatePresence>

    {isDevModalOpen && (
      <DevContextModal 
        messages={messages}
        onboarding={{ 
          ...onboarding, 
          memory: sessionMemory && sessionMemory !== 'Noch keine.'
            ? `--- AKTUELLER SESSION-KONTEXT ---\n${sessionMemory}\n\n${onboarding?.memory || 'Bisher keine Historie.'}` 
            : (onboarding?.memory || 'Bisher keine Historie.')
        }}
        phase={sessionPhase}
        canvas={canvasData}
        onClose={() => setIsDevModalOpen(false)}
      />
    )}

    {isSupportOpen && (
      <SupportModal
        sessionId={currentSessionId}
        projectId={currentProject?.id ?? null}
        phase={sessionPhase}
        onClose={() => setIsSupportOpen(false)}
      />
    )}

    {phaseFeedback && (
      <PhaseFeedbackModal
        phase={phaseFeedback.phase}
        isFinal={phaseFeedback.isFinal}
        onSubmit={(data: PhaseFeedbackData) => {
          void savePhaseFeedback({
            projectId: currentProject?.id ?? null,
            sessionId: currentSessionId,
            phase: phaseFeedback.phase,
            satisfaction: data.satisfaction,
            helpfulness: data.helpfulness,
            comment: data.comment,
          });
        }}
        onClose={() => setPhaseFeedback(null)}
      />
    )}

    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50 text-gray-400">Lade...</div>}>
      <ChatPageContent />
    </Suspense>
  )
}
