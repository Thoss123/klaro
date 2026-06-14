"use client";

/**
 * Workflows — n8n-style overview of every built workflow across ALL projects.
 * Each row opens the full-page editor (/workflows/editor) — the same editor as the
 * canvas popup, but on its own route. Deploy status is cross-referenced from the
 * deployed n8n workflows (workflows table) via canvas_workflow_id.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { loadProjects, loadProjectCanvas } from '@/lib/supabase-chat';
import { getBuiltWorkflows } from '@/lib/workflow-plans';
import { isValidWorkflow } from '@/lib/canvas-normalize';
import WorkflowNodeGraph from '@/components/canvas/WorkflowNodeGraph';
import type { Project, Workflow } from '@/lib/types';
import {
  ArrowLeft, Workflow as WorkflowIcon, RefreshCw, ChevronRight, Folder, Loader2,
} from 'lucide-react';

type DeployStatus = 'active' | 'inactive' | 'draft' | 'error' | 'none';

const STATUS_CONF: Record<DeployStatus, { label: string; pill: string; dot: string }> = {
  active:   { label: 'Live',          pill: 'bg-green-50 text-green-700 border-green-200',  dot: 'bg-green-500' },
  inactive: { label: 'Deployed',      pill: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  draft:    { label: 'Entwurf',       pill: 'bg-amber-50 text-amber-700 border-amber-200',  dot: 'bg-amber-400' },
  error:    { label: 'Fehler',        pill: 'bg-red-50 text-red-700 border-red-200',        dot: 'bg-red-500' },
  none:     { label: 'Nicht deployt', pill: 'bg-gray-50 text-gray-500 border-gray-200',     dot: 'bg-gray-300' },
};

interface ProjectGroup {
  project: Project;
  workflows: Workflow[];
}

export default function WorkflowsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  // canvas_workflow_id → deploy status
  const [statusByWf, setStatusByWf] = useState<Record<string, DeployStatus>>({});

  const refresh = useCallback(async () => {
    setError('');
    try {
      const projects = await loadProjects();
      const canvases = await Promise.all(
        projects.map(async p => ({ project: p, canvas: await loadProjectCanvas(p.id).catch(() => null) })),
      );
      // Nur Phase 4: vorher ist canvas.workflows die Plan-Liste (Phase 3), keine gebauten Workflows.
      const nextGroups: ProjectGroup[] = canvases
        .map(({ project, canvas }) => ({
          project,
          workflows: canvas?.phase === 'umsetzung' ? getBuiltWorkflows(canvas).filter(isValidWorkflow) : [],
        }))
        .filter(g => g.workflows.length > 0);
      setGroups(nextGroups);

      // Deploy status across all projects in one call.
      try {
        const res = await fetch('/api/n8n/workflows');
        if (res.ok) {
          const { workflows } = await res.json() as {
            workflows?: Array<{ canvas_workflow_id?: string | null; status?: string | null }>;
          };
          const map: Record<string, DeployStatus> = {};
          for (const w of workflows ?? []) {
            if (w.canvas_workflow_id) map[w.canvas_workflow_id] = (w.status as DeployStatus) || 'inactive';
          }
          setStatusByWf(map);
        }
      } catch { /* status is best-effort */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Konnte Workflows nicht laden');
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }
      await refresh();
      setLoading(false);
    };
    init();
  }, [router, refresh]);

  const totalCount = useMemo(() => groups.reduce((n, g) => n + g.workflows.length, 0), [groups]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-gray-400 text-sm">
        <Loader2 size={16} className="animate-spin mr-2" /> Lade Workflows…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 bg-grid font-sans">
      <nav className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-gray-400 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Zurück">
            <ArrowLeft size={18} />
          </button>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white font-bold text-lg">K</span>
          <span className="font-bold text-gray-900 text-lg">Workflows</span>
        </div>
        <button onClick={() => { setLoading(true); refresh().finally(() => setLoading(false)); }} className="text-gray-400 hover:text-indigo-600 p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Aktualisieren">
          <RefreshCw size={16} />
        </button>
      </nav>

      <div className="max-w-5xl mx-auto px-6 pb-20">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Alle Workflows</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {totalCount} Workflow{totalCount !== 1 ? 's' : ''} über {groups.length} Projekt{groups.length !== 1 ? 'e' : ''}
          </p>
        </div>

        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>}

        {groups.length === 0 ? (
          <div className="text-center py-24 text-gray-400">
            <WorkflowIcon size={40} className="mx-auto mb-4 opacity-30" />
            <p className="font-medium">Noch keine gebauten Workflows.</p>
            <p className="text-sm mt-1">Erreiche Phase 4 in einem Projekt, um Workflows zu bauen.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {groups.map(({ project, workflows }) => (
              <section key={project.id}>
                <div className="flex items-center gap-2 mb-3 text-gray-500">
                  <Folder size={15} className="text-indigo-400" />
                  <h2 className="font-semibold text-sm text-gray-700">{project.name}</h2>
                  <span className="text-xs text-gray-400">· {workflows.length}</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  {workflows.map(wf => (
                    <WorkflowRow
                      key={wf.id}
                      workflow={wf}
                      status={statusByWf[wf.id] ?? 'none'}
                      onOpen={() => router.push(`/workflows/editor?project=${project.id}&id=${encodeURIComponent(wf.id)}`)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkflowRow({
  workflow, status, onOpen,
}: {
  workflow: Workflow;
  status: DeployStatus;
  onOpen: () => void;
}) {
  const conf = STATUS_CONF[status];
  const stepCount = workflow.steps?.length ?? 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-200 transition-all overflow-hidden group"
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${conf.pill}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} /> {conf.label}
            </span>
            <span className="text-[11px] text-gray-400">{stepCount} {stepCount === 1 ? 'Schritt' : 'Schritte'}</span>
          </div>
          <h3 className="font-bold text-gray-900 text-sm leading-snug line-clamp-2">{workflow.title}</h3>
        </div>
        <ChevronRight size={18} className="text-gray-300 group-hover:text-indigo-500 shrink-0 mt-1 transition-colors" />
      </div>
      <div className="px-5 pb-4">
        <WorkflowNodeGraph steps={workflow.steps ?? []} compact showTrailingPlus={false} />
      </div>
    </button>
  );
}
