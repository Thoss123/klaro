"use client";

/**
 * Sprint 5 — Workflows tab.
 * Lists the user's deployed n8n workflows in an n8n-style view: status, the
 * node graph (WorkflowGraph), executions, and activate / test / delete controls.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import WorkflowGraph, { N8nWorkflowJson } from '@/components/canvas/WorkflowGraph';
import {
  ArrowLeft, Play, Power, PowerOff, Trash2, Loader2, Activity,
  CheckCircle2, XCircle, Workflow as WorkflowIcon, RefreshCw,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface DeployedWorkflow {
  id: string;
  name: string;
  status: 'draft' | 'inactive' | 'active' | 'error';
  n8n_workflow_id: string | null;
  linked_use_case: string | null;
  workflow_json: N8nWorkflowJson | null;
  created_at: string;
}

interface Execution {
  id: string;
  status: 'success' | 'error' | 'running' | 'waiting';
  startedAt: string;
  stoppedAt?: string;
}

const STATUS_CONF: Record<string, { label: string; pill: string; dot: string }> = {
  active:   { label: 'Aktiv',    pill: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500' },
  inactive: { label: 'Inaktiv',  pill: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  draft:    { label: 'Entwurf',  pill: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400' },
  error:    { label: 'Fehler',   pill: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
};

export default function WorkflowsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [workflows, setWorkflows] = useState<DeployedWorkflow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/n8n/workflows');
      if (!res.ok) throw new Error('Konnte Workflows nicht laden');
      const { workflows: wf } = await res.json();
      setWorkflows(wf || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler');
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

  const patch = async (id: string, action: 'activate' | 'deactivate') => {
    setBusyId(id);
    try {
      const res = await fetch('/api/n8n/workflows', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      if (res.ok) {
        const { workflow } = await res.json();
        setWorkflows(ws => ws.map(w => (w.id === id ? { ...w, status: workflow.status } : w)));
      }
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await fetch('/api/n8n/workflows', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setWorkflows(ws => ws.filter(w => w.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-gray-400 text-sm">Lade Workflows…</div>;
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
        <button onClick={refresh} className="text-gray-400 hover:text-indigo-600 p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Aktualisieren">
          <RefreshCw size={16} />
        </button>
      </nav>

      <div className="max-w-5xl mx-auto px-6 pb-20">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Deine Automatisierungen</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {workflows.length} Workflow{workflows.length !== 1 ? 's' : ''} in n8n bereitgestellt
          </p>
        </div>

        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>}

        {workflows.length === 0 ? (
          <div className="text-center py-24 text-gray-400">
            <WorkflowIcon size={40} className="mx-auto mb-4 opacity-30" />
            <p className="font-medium">Noch keine Workflows bereitgestellt.</p>
            <p className="text-sm mt-1">Schließe Phase 4 im Chat ab, um deine Workflows zu deployen.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {workflows.map(wf => (
              <WorkflowCard
                key={wf.id}
                wf={wf}
                busy={busyId === wf.id}
                onActivate={() => patch(wf.id, 'activate')}
                onDeactivate={() => patch(wf.id, 'deactivate')}
                onDelete={() => remove(wf.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkflowCard({
  wf, busy, onActivate, onDeactivate, onDelete,
}: {
  wf: DeployedWorkflow;
  busy: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) {
  const [executions, setExecutions] = useState<Execution[] | null>(null);
  const [loadingEx, setLoadingEx] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const conf = STATUS_CONF[wf.status] || STATUS_CONF.draft;
  const nodeCount = wf.workflow_json?.nodes?.length || 0;

  const loadExecutions = async () => {
    setLoadingEx(true);
    try {
      const res = await fetch(`/api/n8n/executions?workflow_id=${wf.id}`);
      if (res.ok) setExecutions((await res.json()).executions || []);
    } finally {
      setLoadingEx(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/n8n/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: wf.id }),
      });
      setTestResult(res.ok ? 'success' : 'error');
      if (res.ok) loadExecutions();
    } catch {
      setTestResult('error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-4 p-5 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${conf.pill}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} /> {conf.label}
            </span>
            <span className="text-[11px] text-gray-400">{nodeCount} Schritte</span>
            {wf.n8n_workflow_id && (
              <span className="text-[11px] text-gray-400 font-mono truncate">· {wf.n8n_workflow_id}</span>
            )}
          </div>
          <h2 className="font-bold text-gray-900 text-base leading-snug truncate">{wf.name}</h2>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={runTest}
            disabled={testing || !wf.n8n_workflow_id}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors"
            title="Test-Durchlauf"
          >
            {testing ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Test
          </button>
          {wf.status === 'active' ? (
            <button onClick={onDeactivate} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <PowerOff size={13} />} Pausieren
            </button>
          ) : (
            <button onClick={onActivate} disabled={busy || !wf.n8n_workflow_id} className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />} Aktivieren
            </button>
          )}
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} disabled={busy} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Löschen">
              <Trash2 size={14} />
            </button>
          ) : (
            <button onClick={onDelete} disabled={busy} className="text-xs font-bold text-white bg-red-500 hover:bg-red-600 px-2.5 py-1.5 rounded-lg transition-colors">
              {busy ? <Loader2 size={13} className="animate-spin" /> : 'Löschen?'}
            </button>
          )}
        </div>
      </div>

      <div className="px-5 pb-4">
        <WorkflowGraph workflow={wf.workflow_json} height={240} />
      </div>

      {testResult && (
        <div className={`mx-5 mb-3 flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg ${testResult === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {testResult === 'success' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {testResult === 'success' ? 'Test-Durchlauf gestartet.' : 'Test fehlgeschlagen — Workflow evtl. nicht deployed.'}
        </div>
      )}

      <div className="border-t border-gray-100 px-5 py-3">
        <button onClick={() => { if (!executions) loadExecutions(); else setExecutions(null); }} className="flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors">
          <Activity size={13} /> {executions ? 'Ausführungen ausblenden' : 'Ausführungen anzeigen'}
        </button>
        <AnimatePresence>
          {executions && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="pt-3">
                {loadingEx ? (
                  <div className="text-xs text-gray-400 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Lade…</div>
                ) : executions.length === 0 ? (
                  <div className="text-xs text-gray-400">Noch keine Ausführungen.</div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {executions.map(ex => (
                      <div key={ex.id} className="flex items-center gap-2 text-xs">
                        {ex.status === 'success' ? <CheckCircle2 size={13} className="text-green-500" /> : ex.status === 'error' ? <XCircle size={13} className="text-red-500" /> : <Loader2 size={13} className="text-amber-500" />}
                        <span className="font-mono text-gray-500">{ex.id}</span>
                        <span className="text-gray-400">· {new Date(ex.startedAt).toLocaleString('de-AT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
