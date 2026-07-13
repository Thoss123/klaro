"use client";

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  HelpCircle,
  PlayCircle,
  PauseCircle,
  ListChecks,
  Activity,
  MessageSquare,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { Card, CardHeader, EmptyState, Pill } from '@/components/bernd/ui';

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

interface ActivityEvent {
  kind: 'message' | 'approval';
  who: string;
  what: string;
  when: string;
}

const STATUS_META: Record<
  HumanRun['status'],
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  ok: { label: 'lief erfolgreich', className: 'text-emerald-500', icon: CheckCircle2 },
  fehler: { label: 'ist fehlgeschlagen', className: 'text-red-500', icon: XCircle },
  läuft: { label: 'läuft gerade', className: 'text-amber-500', icon: Loader2 },
  unbekannt: { label: 'Status unbekannt', className: 'text-slate-400', icon: HelpCircle },
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
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/bernd/logs?projectId=${encodeURIComponent(projectId)}&include=messages`);
        if (!res.ok) throw new Error('Logs konnten nicht geladen werden');
        const data = await res.json();
        if (!cancelled) {
          setFlows(data.flows ?? []);
          setActivity(data.activity ?? []);
        }
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
    return (
      <Card className="px-5 py-6 text-sm text-slate-400">Lade Flows &amp; Ausführungen…</Card>
    );
  }

  if (error) {
    return <Card className="px-5 py-6 text-sm text-red-600">{error}</Card>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Aktivität: gemischte Konversations- + Freigabe-Ereignisse (bernd_messages + agent_pending_actions) */}
      <Card>
        <CardHeader icon={Activity} title="Aktivität" subtitle="Zuletzt passiert" />
        {activity.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Noch keine Aktivität"
            hint="Sobald Bernd Nachrichten austauscht oder Freigaben abschließt, siehst du es hier."
          />
        ) : (
          <ul className="divide-y divide-slate-50">
            {activity.map((event, i) => {
              const Icon = event.kind === 'approval' ? CheckCircle2 : event.who === 'Bernd' ? ArrowUpRight : ArrowDownLeft;
              return (
                <li key={i} className="flex items-center gap-3 px-5 py-3">
                  <Icon size={15} className="shrink-0 text-slate-400" />
                  <span className="flex-1 truncate text-sm text-slate-600">
                    <span className="font-semibold text-slate-800">{event.who}</span> {event.what || '(kein Text)'}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{formatWhen(event.when)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {flows.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title="Noch keine Flows eingerichtet"
            hint="Sobald Bernd Abläufe für dich übernimmt, findest du hier jede Ausführung mit Status und Zeitpunkt."
          />
        </Card>
      ) : (
        flows.map((flow) => (
          <Card key={flow.workflow_id} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <ListChecks size={15} />
                </span>
                <h3 className="truncate text-sm font-semibold text-slate-900">{flow.name}</h3>
              </div>
              {flow.active ? (
                <Pill tone="green" icon={PlayCircle}>
                  Aktiv
                </Pill>
              ) : (
                <Pill tone="slate" icon={PauseCircle}>
                  Pausiert
                </Pill>
              )}
            </div>

            {flow.runs.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">Noch keine Ausführungen.</p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {flow.runs.map((run, i) => {
                  const meta = STATUS_META[run.status];
                  const Icon = meta.icon;
                  return (
                    <li key={i} className="flex items-center gap-3 px-5 py-3">
                      <Icon
                        size={16}
                        className={`shrink-0 ${meta.className} ${run.status === 'läuft' ? 'animate-spin' : ''}`}
                      />
                      <span className="flex-1 text-sm text-slate-600">{run.error ?? meta.label}</span>
                      <span className="shrink-0 text-xs text-slate-400">{formatWhen(run.when)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
