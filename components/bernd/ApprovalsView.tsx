"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, X, ChevronDown, ChevronUp, Loader2, Inbox, Clock, Send, XCircle } from 'lucide-react';
import { Card, CardHeader, EmptyState, Pill } from '@/components/bernd/ui';
import { getTemplateManifest } from '@/lib/bernd/templates';

interface ApprovalsViewProps {
  projectId: string;
}

interface ApprovalItem {
  id: string;
  channel: string;
  contact: string;
  kind: string;
  payload: { subject?: string; draft?: string; mail_ref?: string; flow_slug?: string };
  status: string;
  created_at: string;
  updated_at: string;
}

const POLL_MS = 10_000;
const DRAFT_PREVIEW_CHARS = 220;

/** "vor 2 Std." / "vor 5 Min." / "gerade eben" — grob genug fürs Dashboard, keine Extra-Lib nötig. */
function formatAge(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tag${days === 1 ? '' : 'en'}`;
}

const RESOLVED_META: Record<string, { label: string; tone: 'green' | 'amber' | 'red' | 'slate'; icon: typeof Check }> = {
  approved: { label: 'freigegeben – Versand läuft', tone: 'amber', icon: Clock },
  sent: { label: 'gesendet', tone: 'green', icon: Send },
  cancelled: { label: 'abgelehnt', tone: 'slate', icon: XCircle },
};

/**
 * "Freigaben"-Tab (Dashboard-Cockpit-Ausbau WP7): listet `agent_pending_actions` des
 * Projekts — offene Freigaben zuerst, mit Freigeben/Ablehnen-Buttons; darunter die zuletzt
 * abgeschlossenen (gesendet/abgelehnt) als Verlauf. Pollt alle 10s (Muster wie
 * `PairingCard.tsx`) statt Realtime, weil hier keine Live-Interaktion nötig ist.
 *
 * WICHTIG: "Freigeben" im Dashboard setzt nur den DB-Status auf `approved` — der eigentliche
 * Versand läuft (noch, siehe Architekturplan WP6) über den Telegram-Pfad/n8n. Der Status wird
 * deshalb ehrlich als "freigegeben – Versand läuft" angezeigt, nicht als "gesendet".
 */
export function ApprovalsView({ projectId }: ApprovalsViewProps) {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/bernd/approvals?projectId=${encodeURIComponent(projectId)}`);
      if (!res.ok) throw new Error('Freigaben konnten nicht geladen werden');
      const data = await res.json();
      setItems(data.items ?? []);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Freigaben konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const decide = async (item: ApprovalItem, nextStatus: 'approved' | 'cancelled') => {
    setActingId(item.id);
    setActionError(null);
    try {
      const res = await fetch('/api/agent/pending', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, project_id: projectId, status: nextStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Freigabe konnte nicht aktualisiert werden');
      }
      await load();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Freigabe konnte nicht aktualisiert werden');
      await load();
    } finally {
      setActingId(null);
    }
  };

  if (loading) {
    return <Card className="px-5 py-6 text-sm text-slate-400">Lade Freigaben…</Card>;
  }

  if (error) {
    return <Card className="px-5 py-6 text-sm text-red-600">{error}</Card>;
  }

  const pendingItems = items.filter((i) => i.status === 'pending');
  const resolvedItems = items.filter((i) => i.status !== 'pending');

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          icon={Inbox}
          title="Offene Freigaben"
          subtitle="Entwürfe, die auf dein Okay warten"
          action={
            pendingItems.length > 0 ? (
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600">
                {pendingItems.length}
              </span>
            ) : undefined
          }
        />

        {actionError && <p className="border-b border-slate-100 px-5 py-3 text-sm text-red-600">{actionError}</p>}

        {pendingItems.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Nichts offen"
            hint="Sobald Bernd einen Entwurf zur Freigabe vorlegt, erscheint er hier."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {pendingItems.map((item) => {
              const isOpen = expanded.has(item.id);
              const draft = item.payload.draft ?? '';
              const isLong = draft.length > DRAFT_PREVIEW_CHARS;
              const shown = isOpen || !isLong ? draft : `${draft.slice(0, DRAFT_PREVIEW_CHARS)}…`;
              const flowLabel = item.payload.flow_slug
                ? getTemplateManifest(item.payload.flow_slug)?.label ?? item.payload.flow_slug
                : undefined;
              const busy = actingId === item.id;

              return (
                <li key={item.id} className="flex flex-col gap-3 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      {flowLabel && (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
                          {flowLabel}
                        </span>
                      )}
                      <span>{formatAge(item.created_at)}</span>
                    </div>
                    <Pill tone="amber" icon={Clock}>
                      Wartet auf dich
                    </Pill>
                  </div>

                  {item.payload.subject && (
                    <p className="text-sm font-semibold text-slate-800">{item.payload.subject}</p>
                  )}

                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{shown}</p>
                  {isLong && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(item.id)}
                      className="inline-flex w-fit items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      {isOpen ? (
                        <>
                          <ChevronUp size={13} /> Weniger anzeigen
                        </>
                      ) : (
                        <>
                          <ChevronDown size={13} /> Ganzen Entwurf anzeigen
                        </>
                      )}
                    </button>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => decide(item, 'approved')}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-emerald-600/25 transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Freigeben
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(item, 'cancelled')}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
                    >
                      <X size={14} />
                      Ablehnen
                    </button>
                    <span className="text-[11px] text-slate-400">
                      Antwortet auch auf Telegram — erste Antwort gewinnt.
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {resolvedItems.length > 0 && (
        <Card>
          <CardHeader icon={Send} title="Zuletzt entschieden" subtitle="Verlauf abgeschlossener Freigaben" />
          <ul className="divide-y divide-slate-50">
            {resolvedItems.map((item) => {
              const meta = RESOLVED_META[item.status] ?? { label: item.status, tone: 'slate' as const, icon: Inbox };
              const Icon = meta.icon;
              return (
                <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex-1 truncate text-sm text-slate-600">
                    {item.payload.subject || item.payload.draft?.slice(0, 60) || 'Entwurf'}
                  </span>
                  <Pill tone={meta.tone} icon={Icon}>
                    {meta.label}
                  </Pill>
                  <span className="shrink-0 text-xs text-slate-400">{formatAge(item.updated_at)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
