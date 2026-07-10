"use client";

import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, HelpCircle, PlayCircle, PauseCircle } from 'lucide-react';

interface LogsWorkflowsProps {
  projectId: string;
}

interface HumanRun {
  flow_label: string;
  status: 'ok' | 'fehler' | 'läuft' | 'unbekannt';
  when: string;
  error?: string;
}

interface FlowSummary {
  workflow_id: string;
  n8n_workflow_id: string | null;
  name: string;
  active: boolean;
  last_execution_at: string | null;
  execution_count: number;
  runs: HumanRun[];
}

const STATUS_META: Record<HumanRun['status'], { label: string; className: string; icon: typeof CheckCircle2 }> = {
  ok: { label: 'lief erfolgreich', className: 'text-green-600', icon: CheckCircle2 },
  fehler: { label: 'ist fehlgeschlagen', className: 'text-red-600', icon: XCircle },
  läuft: { label: 'läuft gerade', className: 'text-amber-600', icon: Loader2 },
  unbekannt: { label: 'Status unbekannt', className: 'text-gray-400', icon: HelpCircle },
};

function formatWhen(when: string): string {
  const date = new Date(when);
  if (Number.isNaN(date.getTime())) return when;
  return date.toLocaleString('de-AT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * "Logs & Workflows"-Bereich des Bernd-Dashboards (Architekturplan §5 Screen 3d): lädt
 * /api/bernd/logs und zeigt eine gebündelte, lesbare Ausführungs-Liste (Alltagssprache,
 * kein roher Node-Graph) sowie die aktiven Flows selbst.
 */
export function LogsWorkflows({ projectId }: LogsWorkflowsProps) {
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/bernd/logs?projectId=${encodeURIComponent(projectId)}`);
        if (!res.ok) throw new Error('Logs konnten nicht geladen werden');
        const data = await res.json();
        if (!cancelled) setFlows(data.flows ?? []);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Logs konnten nicht geladen werden');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) {
    return <p className="text-sm text-gray-400">Lade Flows & Ausführungen…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (flows.length === 0) {
    return <p className="text-sm text-gray-400">Noch keine Flows eingerichtet.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {flows.map((flow) => (
        <section key={flow.workflow_id} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">{flow.name}</h3>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                flow.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {flow.active ? <PlayCircle size={12} /> : <PauseCircle size={12} />}
              {flow.active ? 'Aktiv' : 'Pausiert'}
            </span>
          </div>

          {flow.runs.length === 0 ? (
            <p className="text-sm text-gray-400">Noch keine Ausführungen.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {flow.runs.map((run, i) => {
                const meta = STATUS_META[run.status];
                const Icon = meta.icon;
                return (
                  <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                    <Icon size={14} className={`shrink-0 ${meta.className} ${run.status === 'läuft' ? 'animate-spin' : ''}`} />
                    <span className="flex-1">
                      {run.error ?? meta.label}
                    </span>
                    <span className="text-xs text-gray-400">{formatWhen(run.when)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
