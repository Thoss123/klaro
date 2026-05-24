"use client"

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import ChatWindow from '@/components/chat/ChatWindow';
import ChatInput from '@/components/chat/ChatInput';
import RoadmapCanvas from '@/components/canvas/RoadmapCanvas';
import { Message, CanvasData, OnboardingData } from '@/lib/types';
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
} from '@/lib/supabase-chat';
import ProjectHeader from '@/components/chat/ProjectHeader';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useRouter, useSearchParams } from 'next/navigation';
import { Menu, MoreHorizontal, Maximize2, Minimize2, X, Plus, Settings, Home as HomeIcon, MessageCircle, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const PHASE_LABELS: Record<string, string> = {
  diagnose: '1. Diagnose',
  analyse: '2. Analyse',
  plan: '3. Plan',
};

const PHASE_ORDER = ['diagnose', 'analyse', 'plan'];

const emptyCanvas: CanvasData = {
  pain_points: [],
  use_cases: [],
  documents: [],
  phase: 'diagnose',
};

function ChatPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [userId, setUserId] = useState<string | null>(null);

  // ---- Core state ----
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [canvasData, setCanvasData] = useState<CanvasData>(emptyCanvas);
  const [onboarding, setOnboarding] = useState<OnboardingData | null>(null);

  // ---- Session state ----
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isPreparingNextPhase, setIsPreparingNextPhase] = useState(false);

  // ---- UI state ----
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [isChatsMenuOpen, setIsChatsMenuOpen] = useState(false);
  const [isPhaseMenuOpen, setIsPhaseMenuOpen] = useState(false);

  // ---- Project state ----
  const [currentProject, setCurrentProject] = useState<{ id: string, name: string } | null>(null);

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
    const ob = targetOnboarding || onboarding || { ziel: '', ki_erfahrung: '', wer_setzt_um: '', hindernis: '', branche: '', tempo: '', unternehmensgroesse: '' };
    if ((!content.trim() && !isHiddenInit) || isStreaming) return;

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

    let newMessages: Message[] = [];
    if (messagesOverride) {
      newMessages = [...messagesOverride];
    } else {
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content
      };
      newMessages = [...messages];
      if (!isHiddenInit) {
        newMessages.push(userMessage);
        setMessages(newMessages);
        setInput('');
      }
    }

    if (!isHiddenInit) {
      const lastUserMsg = newMessages[newMessages.length - 1];
      if (lastUserMsg && lastUserMsg.role === 'user') {
        await saveMessage(sessionId, 'user', lastUserMsg.content);

        // Auto-set title from first user message
        const sessionList = await refreshSessions();
        const session = sessionList.find(s => s.id === sessionId);
        if (session && !session.title) {
          const title = lastUserMsg.content.substring(0, 60) + (lastUserMsg.content.length > 60 ? '...' : '');
          await updateSessionTitle(sessionId, title);
          refreshSessions();
        }
      }
    } else {
       await markWelcomeSent(sessionId);
    }

    setIsStreaming(true);
    abortControllerRef.current = new AbortController();

    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      const payloadMessages = isHiddenInit
        ? [{ role: 'user', content: 'Hallo, lass uns starten!' }]
        : newMessages.map(m => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          messages: payloadMessages,
          session_id: sessionId,
          onboarding: ob,
          phase: canvasData.phase,
          canvas: canvasData
        })
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let streamCanvasData = { ...canvasData };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;

        const newCanvas = processCanvasUpdates(assistantContent, streamCanvasData);
        if (JSON.stringify(newCanvas) !== JSON.stringify(streamCanvasData)) {
          streamCanvasData = newCanvas;
          setCanvasData(newCanvas);
        }

        setMessages(prev => 
          prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m)
        );
      }

      await saveMessage(sessionId, 'assistant', assistantContent);
      await saveCanvas(sessionId, streamCanvasData);

      if (streamCanvasData.phase !== canvasData.phase) {
        await updateSessionPhase(sessionId, streamCanvasData.phase);
        refreshSessions();
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
         console.log('Stream aborted');
      } else {
         console.error('Chat API Error:', err);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [messages, isStreaming, onboarding, currentSessionId, userId, refreshSessions, canvasData]);

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

          // Auto-send welcome
          const intro = (obData as OnboardingData).intro_message?.trim();
          setTimeout(() => {
             if (intro) {
               sendMessage(intro, false, [], newId, obData);
             } else {
               sendMessage('Hallo, lass uns starten!', true, [], newId, obData);
             }
          }, 500);
          
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

  // ---- Background Task: Prepare Next Phase ----
  useEffect(() => {
    const runPhasePrep = async () => {
      if (!currentSessionId || !userId || !currentProject || isLoadingSession || isPreparingNextPhase) return;

      const hasPhaseComplete = messages.some(m => 
        m.role === 'assistant' && 
        (m.content.includes('<phase_complete>diagnose</phase_complete>') || 
         m.content.includes('<phase_complete>analyse</phase_complete>'))
      );

      if (!hasPhaseComplete) return;

      const currentIndex = PHASE_ORDER.indexOf(canvasData.phase);
      if (currentIndex >= PHASE_ORDER.length - 1) return; // Last phase

      const nextPhase = PHASE_ORDER[currentIndex + 1];

      // Check if next phase session already exists for this project
      const projectSessions = sessions.filter(s => s.project_id === currentProject.id);
      const hasNextSession = projectSessions.some(s => s.phase === nextPhase);

      if (hasNextSession) return; // Already prepared

      setIsPreparingNextPhase(true);
      try {
        const res = await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages })
        });
        const { summary } = await res.json();
        
        const updatedOnboarding = { ...onboarding, memory: summary };
        const nextCanvasData = { ...canvasData, phase: nextPhase as any };
        
        const newId = await createSession(updatedOnboarding as any, userId, nextPhase, summary, nextCanvasData, currentProject.id);
        await refreshSessions();
      } catch (err) {
        console.error('Error preparing next phase:', err);
      } finally {
        setIsPreparingNextPhase(false);
      }
    };

    runPhasePrep();
  }, [messages, currentSessionId, userId, currentProject, sessions, canvasData, isLoadingSession, isPreparingNextPhase, onboarding, refreshSessions]);


  // ---- Load a specific session ----
  // Queries project directly from Supabase so it never relies on stale sessions state.
  const switchToSession = async (sessionId: string) => {
    setIsLoadingSession(true);
    const supabase = createSupabaseBrowserClient();
    try {
      const [msgs, canvas, ob, sessionRes] = await Promise.all([
        loadSessionMessages(sessionId),
        loadSessionCanvas(sessionId),
        loadSessionOnboarding(sessionId),
        supabase.from('sessions').select('project_id').eq('id', sessionId).maybeSingle(),
      ]);
      setMessages(msgs);
      setCanvasData(canvas || emptyCanvas);
      if (ob) setOnboarding(ob);
      setCurrentSessionId(sessionId);

      // Load the project directly — no stale closure risk
      const projectId = sessionRes.data?.project_id;
      if (projectId) {
        const { data: proj } = await supabase
          .from('projects')
          .select('id, name')
          .eq('id', projectId)
          .maybeSingle();
        setCurrentProject(proj ? { id: proj.id, name: proj.name } : null);
      } else {
        setCurrentProject(null);
      }
    } catch (err) {
      console.error('Error loading session:', err);
    } finally {
      setIsLoadingSession(false);
    }
  };

  // ---- Create a new session ----
  const handleNewChat = useCallback(async () => {
    const ob = onboarding || { ziel: '', ki_erfahrung: '', wer_setzt_um: '', hindernis: '', branche: '', tempo: '', unternehmensgroesse: '' };
    if (!userId) return;
    try {
      const projectId = currentProject?.id ?? await ensureDefaultProject(userId);
      const newId = await createSession(ob, userId, 'diagnose', undefined, undefined, projectId);
      setCurrentSessionId(newId);
      setMessages([]);
      setCanvasData(emptyCanvas);
      await refreshSessions();
      
      // Auto-send welcome for new chat
      setTimeout(() => {
         sendMessage('Hallo, lass uns starten!', true, [], newId, ob);
      }, 500);
      
    } catch (err) {
      console.error('Error creating session:', err);
    }
  }, [onboarding, userId, currentProject, refreshSessions, sendMessage]);

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
        sendMessage('Hallo, lass uns starten!', true, [], newId, ob);
      }, 400);
    } catch (err) {
      console.error('Error creating project:', err);
    }
  }, [userId, onboarding, refreshSessions, sendMessage]);

  // ---- Canvas update parser ----
  const processCanvasUpdates = (text: string, currentCanvas: CanvasData): CanvasData => {
    let updated = { ...currentCanvas };
    const matches = Array.from(text.matchAll(/<canvas_update>([\s\S]*?)<\/canvas_update>/g));
    if (matches.length > 0) {
      matches.forEach(match => {
        try {
          const update = JSON.parse(match[1]);
          if (update.type === 'pain_point') {
            const exists = updated.pain_points.find(p => p.id === update.data.id);
            if (!exists) {
              updated = { ...updated, pain_points: [...updated.pain_points, update.data] };
            }
          } else if (update.type === 'pain_point_detail') {
            const pIndex = updated.pain_points.findIndex(p => p.id === update.data.id);
            if (pIndex !== -1) {
              const newPts = [...updated.pain_points];
              const p = newPts[pIndex];
              newPts[pIndex] = {
                ...p,
                details: {
                  ...(p.details || {}),
                  [update.data.detail_key]: update.data.detail_value
                }
              };
              updated = { ...updated, pain_points: newPts };
            }
          } else if (update.type === 'use_case') {
            const exists = updated.use_cases.find(p => p.id === update.data.id);
            if (!exists) {
              updated = { ...updated, use_cases: [...updated.use_cases, update.data] };
            }
          } else if (update.type === 'document') {
            const exists = (updated.documents || []).find(p => p.id === update.data.id);
            if (!exists) {
              updated = { ...updated, documents: [...(updated.documents || []), update.data] };
            }
          }
        } catch {
          // ignore partial json parsing errors during stream
        }
      });
    }

    return updated;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const stopChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
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
    const currentIndex = PHASE_ORDER.indexOf(canvasData.phase);
    if (currentIndex < PHASE_ORDER.length - 1 && currentSessionId && currentProject) {
      const nextPhase = PHASE_ORDER[currentIndex + 1];
      
      const projectSessions = sessions.filter(s => s.project_id === currentProject.id);
      const nextSession = projectSessions.find(s => s.phase === nextPhase);
      
      if (nextSession) {
         // Instant transition to already prepared session
         await switchToSession(nextSession.id);
      }
    }
  };

  const handlePhaseCircleClick = async (clickedPhase: string) => {
     if (!currentSessionId || !currentProject) return;
     // Click on a phase should load the session for that phase IN THE SAME PROJECT
     const projectSessions = sessions.filter(s => s.project_id === currentProject.id);
     // Find the most recent session for this phase
     const phaseSession = projectSessions.find(s => s.phase === clickedPhase);
     
     if (phaseSession) {
        await switchToSession(phaseSession.id);
     }
  };

  const sessionsByPhase = sessions.reduce((acc, session) => {
    const phase = session.phase || 'diagnose';
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(session);
    return acc;
  }, {} as Record<string, SessionSummary[]>);

  if (isLoadingSession && !currentSessionId && sessions.length === 0) {
      return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-gray-500">Lade Arbeitsbereich...</div>;
  }

  return (
    <div className="flex w-full h-screen bg-slate-50 bg-grid overflow-hidden relative font-sans">
      
      {/* Sidebar background overlay */}
      <div className={`fixed inset-0 bg-transparent z-10 transition-opacity ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsSidebarOpen(false)}></div>

      {/* Floating Chat Panel (Left) */}
      {!isClosed && (
      <div className={`absolute top-6 left-6 bottom-6 ${isMaximized ? 'w-[600px] z-30' : 'w-[360px] z-20'} bg-white rounded-2xl shadow-xl flex flex-col border border-gray-200 overflow-hidden transition-all duration-300`}>

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
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white shrink-0">
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
                  {sessions.slice(0, 5).map(s => (
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
            {PHASE_LABELS[canvasData.phase] || 'Chat'}
          </span>
          <div className="flex items-center gap-3 text-gray-400">
            <button onClick={() => setIsMaximized(!isMaximized)} className="hover:text-gray-700 transition-colors">
               {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button onClick={() => setIsClosed(true)} className="hover:text-gray-700 transition-colors"><X size={18} /></button>
          </div>
        </div>

        {/* Body */}
        <>
            {isLoadingSession && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-gray-400 text-sm">Lade Chat...</div>
              </div>
            )}

            {!isLoadingSession && <ChatWindow messages={messages} onEdit={handleEditMessage} />}

            {isPreparingNextPhase && (
              <div className="px-6 pb-2">
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-blue-600 animate-spin">
                      <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </span>
                  </div>
                  <div className="flex flex-col items-start bg-gray-50 border border-gray-100 shadow-sm rounded-2xl px-4 py-3">
                    <span className="text-xs font-semibold text-gray-700 flex items-center gap-2">
                      Fasse Chat zusammen & bereite nächste Phase vor...
                    </span>
                  </div>
                </div>
              </div>
            )}

            {!isLoadingSession && currentSessionId && currentProject && (() => {
              const sPhase = sessions.find(s => s.id === currentSessionId)?.phase || canvasData.phase;
              const sPhaseIndex = PHASE_ORDER.indexOf(sPhase);
              const cPhaseIndex = PHASE_ORDER.indexOf(canvasData.phase);
              const showBanner = cPhaseIndex < PHASE_ORDER.length - 1;
              const phaseJustCompleted = canvasData.phase !== 'diagnose' || 
                messages.some(m => m.content.includes('<phase_complete>'));
              
              if (!showBanner) return null;
              
              const hasPhaseComplete = messages.some(m => 
                m.role === 'assistant' && 
                (m.content.includes('<phase_complete>diagnose</phase_complete>') || 
                 m.content.includes('<phase_complete>analyse</phase_complete>'))
              );

              if (!hasPhaseComplete) return null;

              // Only show the button if the next phase is PREPARED (isPreparingNextPhase == false AND session exists)
              const nextPhase = PHASE_ORDER[cPhaseIndex + 1];
              const projectSessions = sessions.filter(s => s.project_id === currentProject.id);
              const hasNextSession = projectSessions.some(s => s.phase === nextPhase);

              if (isPreparingNextPhase || !hasNextSession) return null;

              return (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="px-5 py-3 bg-indigo-50 border-t border-indigo-100 flex items-center justify-between shadow-[0_-4px_20px_-10px_rgba(99,102,241,0.3)] z-10"
                >
                  <span className="text-xs text-indigo-700 font-bold uppercase tracking-wider flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                    </span>
                    Phase abgeschlossen!
                  </span>
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="bg-indigo-600 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-md hover:bg-indigo-700 hover:shadow-lg transition-all flex items-center gap-1" 
                    onClick={handleNextPhase}
                  >
                    Gehe zu {PHASE_LABELS[nextPhase]} <ChevronRight size={14} />
                  </motion.button>
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
              />
            )}
          </>
      </div>
      )}

      {/* Floating Chat Reopen Button */}
      {isClosed && (
        <button
          onClick={() => setIsClosed(false)}
          className="absolute bottom-6 left-6 z-30 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-indigo-700 transition-colors"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* Infinite Canvas Area (Center/Right) */}
      <div 
        className="flex-1 w-full h-full overflow-y-auto overflow-x-hidden pt-6 pb-6 pr-6 transition-all duration-300 relative"
        style={{ paddingLeft: isMaximized ? '624px' : '384px' }}
      >
        {/* Top Right Controls — ProjectHeader */}
        {!isLoadingSession && (
          <ProjectHeader
            currentProject={currentProject}
            canvasPhase={canvasData.phase}
            sessions={sessions}
            onPhaseSelect={handlePhaseCircleClick}
            onRename={handleRenameProject}
            onDelete={handleDeleteProject}
            onCreate={handleCreateProject}
          />
        )}

        <RoadmapCanvas 
          data={canvasData} 
          currentPhase={canvasData.phase} 
          onPhaseClick={handlePhaseCircleClick} 
        />
      </div>

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
