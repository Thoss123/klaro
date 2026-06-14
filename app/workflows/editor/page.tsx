"use client";

/**
 * Full-page workflow editor — same editor as the canvas popup (WorkflowDeployModal),
 * but as a real route. Reached from /workflows via navigation (?project=&id=).
 * Edits are persisted back into project_canvas; deploy/test/live go through the
 * existing WorkflowDeployCard logic.
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { loadProjectCanvas, saveProjectCanvas } from '@/lib/supabase-chat';
import { getBuiltWorkflows } from '@/lib/workflow-plans';
import WorkflowDeployCard from '@/components/canvas/WorkflowDeployCard';
import type { CanvasData, StepConfig, Workflow } from '@/lib/types';
import type { WorkflowEditorCoachContext } from '@/lib/workflow-editor-context';
import { Loader2, ArrowLeft } from 'lucide-react';

function EditorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('project');
  const workflowId = searchParams.get('id');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [canvas, setCanvas] = useState<CanvasData | null>(null);
  const [deployedWorkflowId, setDeployedWorkflowId] = useState<string | undefined>(undefined);

  // Mirror canvas so persist callbacks always read the latest state.
  const canvasRef = useRef<CanvasData | null>(null);
  useEffect(() => { canvasRef.current = canvas; }, [canvas]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!projectId || !workflowId) {
        setError('Workflow nicht gefunden.');
        setLoading(false);
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      try {
        const pc = await loadProjectCanvas(projectId);
        if (cancelled) return;
        if (!pc) { setError('Projekt-Canvas nicht gefunden.'); setLoading(false); return; }
        setCanvas(pc);

        // Deployed n8n workflow (if any) for this canvas workflow id.
        try {
          const res = await fetch(`/api/n8n/workflows?project_id=${projectId}`);
          if (res.ok) {
            const { workflows } = await res.json() as {
              workflows?: Array<{ id: string; canvas_workflow_id?: string | null; n8n_workflow_id?: string | null }>;
            };
            const match = workflows?.find(w => w.canvas_workflow_id === workflowId && w.n8n_workflow_id);
            if (match && !cancelled) setDeployedWorkflowId(match.id);
          }
        } catch { /* ignore — editor still usable offline */ }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Fehler beim Laden');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [projectId, workflowId, router]);

  const workflow: Workflow | null = useMemo(() => {
    if (!canvas || !workflowId) return null;
    return getBuiltWorkflows(canvas).find(w => w.id === workflowId) ?? null;
  }, [canvas, workflowId]);

  const stepConfigs = useMemo(
    () => (workflowId ? canvas?.workflow_step_configs?.[workflowId] ?? {} : {}),
    [canvas, workflowId],
  );

  const editorCoachContext = useMemo((): WorkflowEditorCoachContext => ({
    phase: canvas?.phase || 'umsetzung',
    sessionId: null,
    canvas: canvas ?? undefined,
    activeWorkflowId: workflowId ?? undefined,
    mainChatHistory: [],
  }), [canvas, workflowId]);

  // Persist canvas (debounced) so rapid edits / typing don't storm Supabase.
  const persistCanvas = useCallback((next: CanvasData) => {
    if (!projectId) return;
    setCanvas(next);
    canvasRef.current = next;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveProjectCanvas(projectId, next).catch(console.error);
    }, 800);
  }, [projectId]);

  const handleWorkflowPersist = useCallback((updated: Workflow) => {
    const base = canvasRef.current;
    if (!base) return;
    const workflows = (base.workflows ?? []).map(w =>
      w.id === updated.id ? { ...w, steps: updated.steps, edges: updated.edges } : w,
    );
    persistCanvas({ ...base, workflows });
  }, [persistCanvas]);

  const handleStepConfigSave = useCallback((stepId: string, config: StepConfig) => {
    const base = canvasRef.current;
    if (!base || !workflowId) return;
    const next: CanvasData = {
      ...base,
      workflow_step_configs: {
        ...(base.workflow_step_configs ?? {}),
        [workflowId]: { ...(base.workflow_step_configs?.[workflowId] ?? {}), [stepId]: config },
      },
    };
    persistCanvas(next);
  }, [persistCanvas, workflowId]);

  if (loading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-slate-50 text-gray-400 text-sm">
        <Loader2 size={16} className="animate-spin mr-2" /> Lade Workflow…
      </div>
    );
  }

  if (error || !workflow || !projectId) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center gap-4 bg-slate-50 text-gray-500">
        <p className="text-sm">{error || 'Workflow nicht gefunden.'}</p>
        <button
          onClick={() => router.push('/workflows')}
          className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
        >
          <ArrowLeft size={16} /> Zurück zu Workflows
        </button>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full bg-white overflow-hidden">
      <WorkflowDeployCard
        fullPage
        workflow={workflow}
        projectId={projectId}
        stepConfigs={stepConfigs}
        onStepConfigSave={handleStepConfigSave}
        deployedWorkflowId={deployedWorkflowId}
        onDeployed={(dbId) => setDeployedWorkflowId(dbId)}
        onWorkflowPersist={handleWorkflowPersist}
        editorCoachContext={editorCoachContext}
        onClose={() => router.push('/workflows')}
      />
    </div>
  );
}

export default function WorkflowEditorPage() {
  return (
    <Suspense fallback={<div className="h-[100dvh] flex items-center justify-center bg-slate-50 text-gray-400">Lade…</div>}>
      <EditorContent />
    </Suspense>
  );
}
