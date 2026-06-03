"use client"

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import ChatWindow from '@/components/chat/ChatWindow';
import ChatInput from '@/components/chat/ChatInput';
import RoadmapCanvas from '@/components/canvas/RoadmapCanvas';
import { Message, CanvasData, OnboardingData, AgentAction, WorkflowStep } from '@/lib/types';
import {
  createSession,
  loadSessions,
  loadSessionMessages,
  loadSessionCanvas,
  loadSessionOnboarding,
  saveMessage,
  saveCanvas,
  updateSessionPhase,
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
} from '@/lib/supabase-chat';
import ProjectMenu from '@/components/chat/ProjectMenu';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useRouter, useSearchParams } from 'next/navigation';
import { Menu, MoreHorizontal, Maximize2, Minimize2, X, Plus, Settings, Home as HomeIcon, MessageCircle, ChevronRight, Check, Loader2, Sparkles, Brain, FileText, Zap, Key, Rocket, Activity, Database } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { stripInternalTags } from '@/lib/strip-internal-tags';
import { detectCompletedPhase } from '@/lib/detect-phase-transition';
import { canAdvanceFromPhase } from '@/lib/can-phase-complete';
import { getHiddenInitMessage } from '@/lib/phase-welcome';
import {
  shouldAutoKickoffSession,
  getSessionKickoff,
  pickLatestSessionForPhase,
} from '@/lib/session-kickoff';
import {
  type ChatAttachment,
  formatAttachmentsForMessage,
  attachmentsForApi,
} from '@/lib/chat-attachments';
import { evaluateCanvasEligibility, logSync } from '@/lib/sync-decision';
import { normalizeCanvasData } from '@/lib/canvas-normalize';
import { isHiddenSystemMessage } from '@/lib/hidden-chat';
import { titleFromUserMessage } from '@/lib/session-title';

// ---- Agent Actions Feed Component ----
// Renders inline in the chat flow like a real AI-agent tool call:
// a subtle card that shimmers while "running" then flips to a done state.
function AgentActionsFeed({ actions, inline = false }: { actions: AgentAction[], inline?: boolean }) {
  if (actions.length === 0) return null;

  const iconMap: Record<string, React.ReactNode> = {
    canvas_update: <Sparkles size={13} />,
    phase_summary: <FileText size={13} />,
    phase_prepare: <Zap size={13} />,
    memory_save: <Brain size={13} />,
    memory_update: <Brain size={13} />,
    request_credential: <Key size={13} />,
    deploy_workflow: <Rocket size={13} />,
    test_workflow: <Activity size={13} />,
  };

  return (
    <div className={inline ? 'flex flex-col gap-1.5 mb-6 ml-12' : 'px-5 pb-2'}>
      <AnimatePresence mode="popLayout" initial={false}>
        {actions.map(action => (
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

const PHASE_LABELS: Record<string, string> = {
  diagnose: '1. Diagnose',
  analyse: '2. Analyse',
  plan: '3. Plan',
  umsetzung: '4. Umsetzung',
};

const PHASE_ORDER = ['diagnose', 'analyse', 'plan', 'umsetzung'];

function getChatBackgroundStatus(
  agentActions: AgentAction[],
  opts: { isPreparingNextPhase: boolean; sessionPhase: string },
): string | null {
  const running = agentActions.filter(a => a.status === 'running');
  const phaseIdx = PHASE_ORDER.indexOf(opts.sessionPhase);
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
function DevContextModal({
  messages, onboarding, phase, canvas, onClose,
}: {
  messages: any[];
  onboarding: any;
  phase: string;
  canvas: any;
  onClose: () => void;
}) {
  const [data, setData] = React.useState<any>(null);
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
              {data.history.map((m: any, i: number) => (
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
    } catch (e: any) {
      setError(e.message);
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

  // ---- Core state ----
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionMemory, setSessionMemory] = useState<string>('');
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDevModalOpen, setIsDevModalOpen] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const activeTurnRef = useRef(0);
  const [canvasData, setCanvasData] = useState<CanvasData>(emptyCanvas);
  const [onboarding, setOnboarding] = useState<OnboardingData | null>(null);
  /** Chat/API phase — always follows the active session, not project_canvas.progress */
  const [sessionPhase, setSessionPhase] = useState<string>('diagnose');

  // ---- Session state ----
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isPreparingNextPhase, setIsPreparingNextPhase] = useState(false);
  const [preparedNextSessionId, setPreparedNextSessionId] = useState<string | null>(null);
  const [agentActions, setAgentActions] = useState<AgentAction[]>([]);
  const [pendingWelcome, setPendingWelcome] = useState<{ sessionId: string, onboarding?: OnboardingData } | null>(null);
  // Synchronous in-memory lock: prevents concurrent isHiddenInit calls racing through
  // before React state (isStreaming) has had a chance to update.
  const welcomeInProgressRef = useRef<Set<string>>(new Set());

  // ---- UI state ----
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [isChatsMenuOpen, setIsChatsMenuOpen] = useState(false);
  const [isPhaseMenuOpen, setIsPhaseMenuOpen] = useState(false);
  // Mobile: only one of chat / canvas is shown at a time, toggled via a bottom-center switch.
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState<'chat' | 'canvas'>('chat');

  // ---- Phase 4 state ----
  const [credentialRequest, setCredentialRequest] = useState<{ tool: string; label: string; type: string } | null>(null);

  // ---- Dev state ----
  const [isDevContextOpen, setIsDevContextOpen] = useState(false);
  // Maps canvas workflow_id → deployed DB workflow id
  const deployedWorkflowIdsRef = useRef<Record<string, string>>({});
  const prepareNextPhaseRef = useRef<((switchAfter?: boolean) => Promise<void>) | null>(null);
  const phasePrepTriggeredForRef = useRef<Set<string>>(new Set());

  const withSessionPhase = useCallback((canvas: CanvasData, phase: string): CanvasData => ({
    ...canvas,
    phase: phase as CanvasData['phase'],
  }), []);

  // ---- Project state ----
  const [currentProject, setCurrentProject] = useState<{ id: string, name: string } | null>(null);

  const maxReachedPhase = React.useMemo(() => {
    let maxIdx = PHASE_ORDER.indexOf(canvasData.phase || 'diagnose');
    if (currentProject) {
      for (const s of sessions) {
        if (s.project_id !== currentProject.id) continue;
        const idx = PHASE_ORDER.indexOf(s.phase || 'diagnose');
        if (idx > maxIdx) maxIdx = idx;
      }
    }
    return PHASE_ORDER[Math.max(0, maxIdx)] || 'diagnose';
  }, [sessions, currentProject, canvasData.phase]);

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

        const key = `deploy_${tag.workflow_id}`;
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
      : formatAttachmentsForMessage(content, turnAttachments);

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
        : newMessages.map(m => ({ role: m.role, content: m.content }));

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

      // Inject memory into onboarding for the API
      let fullMemoryText = projectMemoryText;
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
          onboarding: obWithMemory,
          phase: chatPhase,
          canvas: withSessionPhase(canvasData, chatPhase),
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
      let streamCanvasData = withSessionPhase(canvasData, chatPhase);
      const shownCanvasActions = new Set<string>();
      // Holder object (not a bare `let`) so TS keeps the Promise|null type:
      // the assignment happens inside the startCanvasWorker closure, which a
      // bare local would narrow away to `null` at the await site below.
      const canvasWorker: { current: Promise<void> | null } = { current: null };

      const hasCanvasTrigger = (text: string) =>
        /<trigger_canvas_update/i.test(text) ||
        /trigger_canvas_update/i.test(text) ||
        /anvas_update>/i.test(text);

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
        if (canvasWorker.current) {
          logSync('canvas', 'skip', `worker already scheduled (${source})`, { reason: 'worker_already_running' });
          return;
        }
        if (!canvasEval.eligible) {
          logSync('canvas', 'skip', `not invoked (${source})`, {
            reason: canvasEval.reason,
            detail: canvasEval.detail,
          });
          return;
        }
        logSync('canvas', 'invoke', `POST /api/canvas-worker (${source})`, {
          projectId: projId,
          phase: chatPhase,
        });
        const aid = addAction('canvas_update', `Klaro strukturiert das Canvas neu...`);
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
              completeAction(aid, 'Canvas erfolgreich aktualisiert');
            } else if (status === 'skipped') {
              logSync('canvas', 'skip', 'worker returned skipped', { reason, detail: data.detail });
              const label =
                reason === 'insufficient_context'
                  ? `Kontext: ${data.detail || 'zu wenig'}`
                  : reason === 'missing_project_id'
                    ? 'kein Projekt'
                    : reason || 'übersprungen';
              completeAction(aid, `Canvas: ${label}`);
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

        if (hasCanvasTrigger(assistantContent) && canvasEval.eligible) {
          if (!shownCanvasActions.has('trigger_canvas')) {
            shownCanvasActions.add('trigger_canvas');
            logSync('canvas', 'evaluate', 'coach sent trigger_canvas_update tag');
            startCanvasWorker('tag');
          }
        } else if (hasCanvasTrigger(assistantContent) && !canvasEval.eligible) {
          logSync('canvas', 'skip', 'tag seen but blocked', {
            reason: canvasEval.reason,
            detail: canvasEval.detail,
          });
        }

        // Process tool calls from the stream
        const toolMatches = Array.from(assistantContent.matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/g));
        if (toolMatches.length > 0) {
          toolMatches.forEach(match => {
            try {
              const toolCall = JSON.parse(match[1]);
              const key = `tool_${match.index}`;
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
                }
              }
            } catch (e) {}
          });
        }

        const visibleContent = stripInternalTags(assistantContent);
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: visibleContent } : m)
        );
      }

      const aborted = abortControllerRef.current?.signal.aborted || activeTurnRef.current !== turnId;
      const rawAssistantContent = assistantContent;
      assistantContent = stripInternalTags(assistantContent);
      setMessages(prev =>
        prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m)
      );
      if (assistantContent.trim()) {
        await saveMessage(sessionId, 'assistant', assistantContent);
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
          if (!shownCanvasActions.has('trigger_canvas')) {
            if (canvasEval.eligible && !canvasWorker.current) {
              logSync('canvas', 'invoke', 'auto_sync (no tag in stream)');
              startCanvasWorker('auto_sync');
            } else if (!canvasWorker.current) {
              logSync('canvas', 'skip', 'auto_sync not run', {
                reason: canvasEval.reason,
                detail: canvasEval.detail,
              });
            }
          } else {
            logSync('canvas', 'evaluate', 'auto_sync skipped — tag already triggered worker');
          }

          if (detectCompletedPhase(rawAssistantContent, chatPhase)) {
            const prepKey = `${sessionId}:${chatPhase}`;
            const gate = canAdvanceFromPhase(chatPhase, canvasSnapshot);
            if (!gate.ok) {
              logSync('canvas', 'skip', `phase_complete blocked: ${gate.reason}`, { phase: chatPhase });
            } else if (!phasePrepTriggeredForRef.current.has(prepKey)) {
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
              PHASE_ORDER.indexOf(existingPc?.phase || chatPhase),
              PHASE_ORDER.indexOf(chatPhase)
            );
            const progressPhase = PHASE_ORDER[progressIdx] || chatPhase;
            await saveProjectCanvas(projId, {
              ...canvasSnapshot,
              phase: progressPhase as CanvasData['phase'],
            });
          }
          await saveCanvas(sessionId, canvasSnapshot);
        } catch (syncErr) {
          console.error('Post-turn sync error:', syncErr);
        }
      };

      void runPostTurnSync();

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Stream aborted');
      } else {
        console.error('Chat API Error:', err);
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
  }, [messages, isStreaming, onboarding, currentSessionId, userId, refreshSessions, canvasData, sessionPhase, sessions, currentProject, addAction, completeAction, failAction, clearActions, processPhase4Tags, withSessionPhase, pendingAttachments]);

  // ---- Auth & Onboarding effect ----
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
         if (targetId) {
            await switchToSession(targetId);
         } else if (list.length > 0) {
            await switchToSession(list[0].id);
         } else {
            setIsLoadingSession(false);
         }
      }
    };
    initAuth();
  }, [router]); // Only run on mount

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
    setIsLoadingSession(true);
    const supabase = createSupabaseBrowserClient();
    try {
      const [msgs, ob, sessionRes, welcomeSent] = await Promise.all([
        loadSessionMessages(sessionId),
        loadSessionOnboarding(sessionId),
        supabase.from('sessions').select('project_id, phase, memory').eq('id', sessionId).maybeSingle(),
        isWelcomeSent(sessionId)
      ]);
      setMessages(msgs.filter(m => !(m.role === 'user' && isHiddenSystemMessage(m.content))));
      if (ob) setOnboarding(ob);
      setSessionMemory(sessionRes.data?.memory || '');
      setCurrentSessionId(sessionId);

      const phase = sessionRes.data?.phase || 'diagnose';
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
          const sessionPhaseIdx = PHASE_ORDER.indexOf(phase as typeof PHASE_ORDER[number]);
          const projectPhaseIdx = PHASE_ORDER.indexOf(projectCanvas.phase as typeof PHASE_ORDER[number]);
          if (sessionPhaseIdx > projectPhaseIdx) {
            const healed = { ...projectCanvas, phase: phase as CanvasData['phase'] };
            saveProjectCanvas(projectId, healed).catch(console.error);
          }
          setCanvasData(withSessionPhase(projectCanvas, phase));
        } else {
          const sessionCanvas = await loadSessionCanvas(sessionId);
          setCanvasData(withSessionPhase(sessionCanvas || emptyCanvas, phase));
        }
      } else {
        setCurrentProject(null);
        const sessionCanvas = await loadSessionCanvas(sessionId);
        setCanvasData(withSessionPhase(sessionCanvas || emptyCanvas, phase));
      }

      setPreparedNextSessionId(null);
      const phaseIdx = PHASE_ORDER.indexOf(phase);
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

  const prepareNextPhase = useCallback(async (switchAfter = true) => {
    if (!currentSessionId || !userId || !currentProject || isPreparingNextPhase) return;

    const phase =
      sessions.find(s => s.id === currentSessionId)?.phase || sessionPhase || 'diagnose';
    const currentIndex = PHASE_ORDER.indexOf(phase);
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

      const nextCanvasData = { ...canvasData, phase: nextPhase as CanvasData['phase'] };
      const canvasActionId = addAction('canvas_update', 'Aktualisiere Projekt-Canvas...');
      await saveProjectCanvas(currentProject.id, nextCanvasData);
      setCanvasData(nextCanvasData);
      completeAction(canvasActionId, 'Projekt-Canvas aktualisiert');

      const prepActionId = addAction('phase_prepare', `Bereite ${PHASE_LABELS[nextPhase]} vor...`);
      const updatedOnboarding = { ...(onboarding || {}), memory: summary } as OnboardingData;
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
      const { createProject } = await import('@/lib/supabase-chat');
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



  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

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
    const currentIndex = PHASE_ORDER.indexOf(sessionPhase);
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
    const targetCanvas = { ...canvasData, phase: targetPhase as any };
    const newId = await createSession(ob as any, userId, targetPhase, '[dev skip]', targetCanvas, currentProject.id);
    await saveProjectCanvas(currentProject.id, targetCanvas);
    await refreshSessions();
    await switchToSession(newId);
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

  const sessionsByPhase = projectSessions.reduce((acc, session) => {
    const phase = session.phase || 'diagnose';
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

  const roadmapCanvasEl = (
    <RoadmapCanvas
      data={canvasData}
      currentPhase={sessions.find(s => s.id === currentSessionId)?.phase || canvasData.phase || 'diagnose'}
      maxReachedPhase={maxReachedPhase}
      onPhaseClick={handlePhaseCircleClick}
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
          ? 'absolute inset-0 z-30 bg-white flex flex-col min-h-0 h-full max-h-full overflow-hidden'
          : `absolute top-6 left-6 bottom-6 ${isMaximized ? 'w-[600px] z-30' : 'w-[360px] z-20'} bg-white rounded-2xl shadow-xl flex flex-col border border-gray-200 overflow-hidden transition-all duration-300`
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
           </motion.div>
         )}
        </AnimatePresence>

        {/* Chat Header */}
        <div className={`flex items-center justify-between border-b border-gray-100 bg-white shrink-0 ${isMobile ? 'px-4 py-3' : 'px-5 py-4'}`}>
          <div className="flex items-center gap-3 text-gray-400 relative">
            <button onClick={() => setIsSidebarOpen(true)} className="hover:text-gray-700 transition-colors"><Menu size={18} /></button>
            <button onClick={() => setIsChatsMenuOpen(!isChatsMenuOpen)} className="hover:text-gray-700 transition-colors"><MoreHorizontal size={18} /></button>
            {isChatsMenuOpen && (
               <div className="absolute top-8 left-6 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-50">
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2" onClick={() => { handleNewChat(); setIsChatsMenuOpen(false); }}>
                    <Plus size={16} /> Neuer Chat
                  </button>
                  <div className="h-px bg-gray-100 my-1"></div>
                  <div className="px-4 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Letzte Chats</div>
                  {projectSessions.slice(0, 5).map(s => (
                    <button
                      key={s.id}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 truncate ${s.id === currentSessionId ? 'text-indigo-600 font-medium' : 'text-gray-600'}`}
                      onClick={() => { switchToSession(s.id); setIsChatsMenuOpen(false); }}
                    >
                      {s.title || 'Neuer Chat'}
                    </button>
                  ))}
               </div>
            )}
          </div>
          <span className="text-sm font-semibold text-gray-700">
            {PHASE_LABELS[sessionPhase] || 'Chat'}
          </span>
          <div className="flex items-center gap-3 text-gray-400">
            <button 
               onClick={() => setIsDevModalOpen(true)} 
               className="hover:text-indigo-600 transition-colors flex items-center gap-1 bg-indigo-50 text-indigo-500 px-2 py-0.5 rounded text-[10px] font-bold"
               title="Dev Context"
            >
               <Database size={12} />
               DEV
            </button>
            {!isMobile && (
              <>
                <button onClick={() => setIsMaximized(!isMaximized)} className="hover:text-gray-700 transition-colors">
                   {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button onClick={() => setIsClosed(true)} className="hover:text-gray-700 transition-colors"><X size={18} /></button>
              </>
            )}
          </div>
        </div>

        {/* DEV: phase-skip toolbar — only in development */}
        {process.env.NODE_ENV === 'development' && !isLoadingSession && currentProject && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-[11px] font-medium text-amber-700 shrink-0">
            <span className="opacity-60">⚡ dev</span>
            {PHASE_ORDER.filter((_, i) => i !== PHASE_ORDER.indexOf(sessionPhase)).map(ph => (
              <button
                key={ph}
                onClick={() => handleDevSkipToPhase(ph)}
                className="px-2 py-0.5 rounded bg-amber-200 hover:bg-amber-300 transition-colors"
              >
                {ph === sessionPhase ? '↺' : PHASE_ORDER.indexOf(ph) > PHASE_ORDER.indexOf(sessionPhase) ? '→' : '←'} {PHASE_LABELS[ph]}
              </button>
            ))}
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
              const sPhaseIndex = PHASE_ORDER.indexOf(sPhase);
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
                            Klaro fasst <strong>{currentPhaseLabel}</strong> zusammen und richtet{' '}
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

            {!isLoadingSession && (
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
            )}
        </div>

        {isMobile && mobileViewSwitch}
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

      {/* Canvas — desktop: main area; mobile: separate tab */}
      {!isMobile && (
      <div
        className="flex-1 w-full h-full overflow-y-auto overflow-x-hidden transition-all duration-300 relative pt-6 pb-6 pr-6"
        style={{ paddingLeft: isMaximized ? '624px' : '384px' }}
      >
        {roadmapCanvasEl}
      </div>
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
