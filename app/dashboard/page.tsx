"use client"

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { loadProjects, loadSessions, createProject, createSession, loadSessionOnboarding, ensureDefaultProject, updateProjectName, deleteProject } from '@/lib/supabase-chat';
import { Project, SessionSummary } from '@/lib/types';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Plus, Folder, LogOut, MoreHorizontal, Trash2, Pencil, ExternalLink, Check, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const PHASE_CONFIG: Record<string, { label: string; pill: string }> = {
  diagnose: { label: 'Diagnose',  pill: 'bg-slate-100 text-slate-600' },
  analyse:  { label: 'Analyse',   pill: 'bg-indigo-50 text-indigo-700' },
  plan:     { label: 'Plan',      pill: 'bg-green-50 text-green-700' },
};

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessionsByProject, setSessionsByProject] = useState<Record<string, SessionSummary[]>>({});
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const loadAll = async (_uid: string) => {
    const projList = await loadProjects();
    setProjects(projList);
    const sessList = await loadSessions();
    const grouped: Record<string, SessionSummary[]> = {};
    for (const s of sessList) {
      if (s.project_id) {
        if (!grouped[s.project_id]) grouped[s.project_id] = [];
        grouped[s.project_id].push(s);
      }
    }
    setSessionsByProject(grouped);
  };

  useEffect(() => {
    const init = async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }
      setUserId(session.user.id);
      try {
        await ensureDefaultProject(session.user.id);
        await loadAll(session.user.id);
      } catch (err) {
        console.error('Dashboard init failed', err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [router]);

  const handleNewProject = async () => {
    if (!userId) return;
    try {
      const newProjectId = await createProject(userId, 'Neues Projekt');
      const allSessions = Object.values(sessionsByProject).flat()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      if (allSessions.length > 0) {
        const ob = await loadSessionOnboarding(allSessions[0].id);
        if (ob) {
          const newSessionId = await createSession(ob, userId, 'diagnose', undefined, undefined, newProjectId);
          router.push(`/chat?id=${newSessionId}`);
          return;
        }
      }
      router.push('/onboarding');
    } catch (err) {
      console.error('Error creating project', err);
    }
  };

  const handleOpenProject = (projectId: string) => {
    const s = sessionsByProject[projectId]?.[0];
    if (s) router.push(`/chat?id=${s.id}`);
  };

  const handleRename = async (projectId: string, name: string) => {
    await updateProjectName(projectId, name);
    setProjects(ps => ps.map(p => p.id === projectId ? { ...p, name } : p));
  };

  const handleDelete = async (projectId: string) => {
    await deleteProject(projectId);
    setProjects(ps => ps.filter(p => p.id !== projectId));
    setSessionsByProject(s => { const next = { ...s }; delete next[projectId]; return next; });
  };

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/');
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-gray-400 text-sm">Lade...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 bg-grid font-sans">
      {/* Nav */}
      <nav className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white font-bold text-lg">K</span>
          <span className="font-bold text-gray-900 text-lg">Klaro</span>
        </div>
        <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-gray-100" title="Ausloggen">
          <LogOut size={18} />
        </button>
      </nav>

      <div className="max-w-5xl mx-auto px-6 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Deine Projekte</h1>
            <p className="text-gray-500 mt-1 text-sm">{projects.length} {projects.length === 1 ? 'Projekt' : 'Projekte'}</p>
          </div>
          <button
            onClick={handleNewProject}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-2.5 px-5 rounded-xl transition-colors flex items-center gap-2 shadow-sm"
          >
            <Plus size={16} /> Neues Projekt
          </button>
        </div>

        {/* Cards grid */}
        {projects.length === 0 ? (
          <div className="text-center py-24 text-gray-400">
            <Folder size={40} className="mx-auto mb-4 opacity-30" />
            <p className="font-medium">Noch keine Projekte vorhanden.</p>
            <button onClick={handleNewProject} className="mt-4 text-indigo-600 text-sm font-semibold hover:underline">
              Erstes Projekt starten →
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                sessions={sessionsByProject[p.id] || []}
                onOpen={() => handleOpenProject(p.id)}
                onRename={(name) => handleRename(p.id, name)}
                onDelete={() => handleDelete(p.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({
  project, sessions, onOpen, onRename, onDelete,
}: {
  project: Project;
  sessions: SessionSummary[];
  onOpen: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(project.name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // latest session = index 0 (sorted desc by created_at)
  const latestPhase = sessions[0]?.phase || 'diagnose';
  const phaseConf = PHASE_CONFIG[latestPhase] || PHASE_CONFIG.diagnose;
  const sessionCount = sessions.length;
  const lastDate = sessions[0]?.created_at
    ? new Date(sessions[0].created_at).toLocaleDateString('de-AT', { day: 'numeric', month: 'short' })
    : null;

  // Close menu on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
        setShowDeleteConfirm(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (isRenaming) inputRef.current?.focus();
  }, [isRenaming]);

  const commitRename = () => {
    const name = renameVal.trim() || project.name;
    setRenameVal(name);
    onRename(name);
    setIsRenaming(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col relative overflow-visible">
      {/* Clickable body */}
      <button
        onClick={onOpen}
        className="flex-1 text-left p-5 pb-4"
      >
        {/* Phase pill */}
        <span className={`inline-block text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full mb-3 ${phaseConf.pill}`}>
          {phaseConf.label}
        </span>

        {/* Name */}
        {isRenaming ? null : (
          <h2 className="font-bold text-gray-900 text-base leading-snug mb-1 pr-6 truncate">{project.name}</h2>
        )}

        {/* Meta */}
        <p className="text-xs text-gray-400">
          {sessionCount} Chat{sessionCount !== 1 ? 's' : ''}
          {lastDate && <> · {lastDate}</>}
        </p>
      </button>

      {/* Rename input (overlays the name area) */}
      {isRenaming && (
        <div className="px-5 pt-1 pb-3 flex items-center gap-2">
          <input
            ref={inputRef}
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setRenameVal(project.name); setIsRenaming(false); } }}
            className="flex-1 text-sm font-semibold text-gray-900 border border-indigo-400 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <button onClick={commitRename} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors">
            <Check size={14} strokeWidth={3} />
          </button>
          <button onClick={() => { setRenameVal(project.name); setIsRenaming(false); }} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 3-dot menu button */}
      <div className="absolute top-3 right-3" ref={menuRef}>
        <button
          onClick={e => { e.stopPropagation(); setIsMenuOpen(o => !o); setShowDeleteConfirm(false); }}
          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <MoreHorizontal size={16} />
        </button>

        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute top-8 right-0 w-48 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 z-50"
            >
              <button
                onClick={e => { e.stopPropagation(); onOpen(); setIsMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <ExternalLink size={14} className="text-gray-400" /> Öffnen
              </button>
              <button
                onClick={e => { e.stopPropagation(); setIsRenaming(true); setIsMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Pencil size={14} className="text-gray-400" /> Umbenennen
              </button>
              <div className="h-px bg-gray-100 my-1" />
              {!showDeleteConfirm ? (
                <button
                  onClick={e => { e.stopPropagation(); setShowDeleteConfirm(true); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14} /> Löschen
                </button>
              ) : (
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-600 mb-2.5 leading-relaxed">Wirklich löschen?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); setShowDeleteConfirm(false); }}
                      className="flex-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg py-1.5 transition-colors"
                    >
                      Nein
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); onDelete(); setIsMenuOpen(false); }}
                      className="flex-1 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg py-1.5 transition-colors"
                    >
                      Ja, löschen
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer: open arrow */}
      <div className="px-5 pb-4 pt-0">
        <button
          onClick={onOpen}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-xl py-2 transition-colors"
        >
          Öffnen <ExternalLink size={12} />
        </button>
      </div>
    </div>
  );
}
