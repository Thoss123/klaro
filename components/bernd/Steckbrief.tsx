"use client"

import React, { useEffect, useState } from 'react';
import { Sparkles, Activity, Radio, Inbox, Building2, Target, ShieldCheck, ListTodo } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getTemplateManifest } from '@/lib/bernd/templates';
import { SCOPE_LABELS } from '@/lib/bernd/scopes';
import type { BerndConfig } from '@/lib/bernd/types';
import { ChannelBadgeList, type ChannelBadgeData } from '@/components/bernd/ChannelBadge';
import { Card, CardHeader, EmptyState, StatusDot } from '@/components/bernd/ui';

interface SteckbriefProps {
  projectId: string;
  config: BerndConfig;
}

interface LatestActivity {
  flow_label: string;
  status: 'ok' | 'fehler' | 'läuft' | 'unbekannt';
  when: string;
}

const STATUS_LABEL: Record<LatestActivity['status'], string> = {
  ok: 'lief erfolgreich',
  fehler: 'ist fehlgeschlagen',
  läuft: 'läuft gerade',
  unbekannt: 'Status unbekannt',
};

const STATUS_DOT: Record<LatestActivity['status'], 'green' | 'red' | 'amber' | 'slate'> = {
  ok: 'green',
  fehler: 'red',
  läuft: 'amber',
  unbekannt: 'slate',
};

// Menschliche Einzeiler je Anwendungsfall (statt der technischen RAG-use_case-Slugs
// aus dem Template-Manifest). Fallback: keine Beschreibung statt kryptischem Slug.
const TEMPLATE_DESCRIPTION: Record<string, string> = {
  'angebot-autopilot': 'Erstellt Angebote aus deinen Ansagen und schickt sie nach Freigabe raus.',
  'rechnung-mahnwesen': 'Schreibt Rechnungen und fasst offene Zahlungen automatisch nach.',
  'followup-serie': 'Fasst bei offenen Angeboten nach — nach 3, 7 und 14 Tagen.',
  'lead-followup': 'Meldet sich bei neuen Anfragen und bleibt für dich dran.',
  'email-triage-draft': 'Sortiert dein Postfach und legt fertige Antwort-Entwürfe bereit.',
  'email-autopilot': 'Beantwortet Standard-Mails selbstständig als Entwurf.',
  'email-learning-engine': 'Lernt aus deinen Korrekturen und wird mit der Zeit besser.',
  'whatsapp-control': 'Freigaben und Rückfragen direkt per Chat.',
  'faq-chatbot': 'Beantwortet Kundenfragen automatisch aus deinem Firmenwissen.',
  'ai-webhook': 'Erledigt einzelne KI-Aufgaben auf Zuruf.',
};

/**
 * Steckbrief-Bereich des Bernd-Dashboards: was Bernd kann (aus active_templates),
 * was gerade läuft (letzte Execution je Flow) + Kanal-Status (Architekturplan §5 Screen 3a).
 */
export function Steckbrief({ projectId, config }: SteckbriefProps) {
  const [activity, setActivity] = useState<LatestActivity[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [channels, setChannels] = useState<ChannelBadgeData[]>([{ channel: 'telegram', status: 'disconnected' }]);

  useEffect(() => {
    let cancelled = false;

    const loadActivity = async () => {
      try {
        const res = await fetch(`/api/bernd/logs?projectId=${encodeURIComponent(projectId)}`);
        if (!res.ok) throw new Error('logs fetch failed');
        const data = await res.json();
        const flows = (data.flows ?? []) as Array<{
          name: string;
          runs: Array<{ status: LatestActivity['status']; when: string }>;
        }>;
        const latest: LatestActivity[] = flows
          .filter((f) => f.runs.length > 0)
          .map((f) => ({ flow_label: f.name, status: f.runs[0].status, when: f.runs[0].when }));
        if (!cancelled) setActivity(latest);
      } catch {
        if (!cancelled) setActivity([]);
      } finally {
        if (!cancelled) setLoadingActivity(false);
      }
    };

    const loadChannel = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase
          .from('bernd_channel_links')
          .select('chat_id, verified_at, pairing_code')
          .eq('project_id', projectId)
          .eq('channel', 'telegram')
          .maybeSingle();
        if (cancelled) return;
        if (!data) {
          setChannels([{ channel: 'telegram', status: 'disconnected' }]);
        } else if (data.verified_at) {
          setChannels([{ channel: 'telegram', status: 'connected', handle: `Chat-ID ${data.chat_id}` }]);
        } else {
          setChannels([{ channel: 'telegram', status: 'pending' }]);
        }
      } catch {
        if (!cancelled) setChannels([{ channel: 'telegram', status: 'disconnected' }]);
      }
    };

    loadActivity();
    loadChannel();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const activeTemplates = config.active_templates ?? [];

  const setupState = config.setup_state ?? {};
  const profil = setupState.profil ?? {};
  const gewaehlteScopes = (setupState.scopes ?? []).filter((s) => s.status === 'gewaehlt');
  const regeln = setupState.regeln ?? [];
  const ziele = setupState.ziele ?? [];
  const hasSetupOverview =
    Object.values(profil).some(Boolean) || gewaehlteScopes.length > 0 || regeln.length > 0 || ziele.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Betrieb & Setup — Zusammenfassung aus dem Setup-Chat (setup_state) */}
      {hasSetupOverview && (
        <Card>
          <CardHeader icon={Building2} title="Betrieb & Setup" subtitle="Was Bernd aus dem Gespräch mitgenommen hat" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            {Object.values(profil).some(Boolean) && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <Building2 size={13} /> Betrieb
                </p>
                <dl className="flex flex-col gap-1.5 text-sm">
                  {profil.firmenname && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-400">Firma</dt>
                      <dd className="text-right font-medium text-slate-700">{profil.firmenname}</dd>
                    </div>
                  )}
                  {profil.standort && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-400">Standort</dt>
                      <dd className="text-right font-medium text-slate-700">{profil.standort}</dd>
                    </div>
                  )}
                  {profil.mitarbeiter && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-400">Mitarbeiter</dt>
                      <dd className="text-right font-medium text-slate-700">{profil.mitarbeiter}</dd>
                    </div>
                  )}
                  {profil.ton && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-400">Ton</dt>
                      <dd className="text-right font-medium text-slate-700">{profil.ton}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {gewaehlteScopes.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <ListTodo size={13} /> Gewählte Aufgaben
                </p>
                <ul className="flex flex-col gap-1.5">
                  {gewaehlteScopes.map((scope) => (
                    <li key={scope.id} className="text-sm text-slate-700">
                      {SCOPE_LABELS[scope.id] ?? scope.id}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {regeln.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <ShieldCheck size={13} /> Regeln
                </p>
                <ul className="flex flex-col gap-1.5">
                  {regeln.map((regel, i) => (
                    <li key={i} className="text-sm text-slate-700">
                      {regel}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {ziele.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <Target size={13} /> Ziele
                </p>
                <ul className="flex flex-col gap-1.5">
                  {ziele.map((ziel, i) => (
                    <li key={i} className="text-sm text-slate-700">
                      {ziel}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Was Bernd kann */}
      <Card>
        <CardHeader
          icon={Sparkles}
          title="Was Bernd kann"
          subtitle="Aktivierte Anwendungsfälle"
          action={
            activeTemplates.length > 0 ? (
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600">
                {activeTemplates.length}
              </span>
            ) : undefined
          }
        />
        {activeTemplates.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Noch keine Anwendungsfälle aktiv"
            hint="Sobald du Bernd eingerichtet hast, erscheinen hier seine Fähigkeiten."
          />
        ) : (
          <div className="grid gap-2.5 p-4 sm:grid-cols-2">
            {activeTemplates.map((t) => {
              const manifest = getTemplateManifest(t.slug);
              const description = TEMPLATE_DESCRIPTION[t.slug];
              return (
                <div
                  key={t.slug}
                  className="group flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/60">
                    <Sparkles size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{manifest?.label ?? t.slug}</p>
                    {description && (
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Was gerade läuft */}
      <Card>
        <CardHeader icon={Activity} title="Was gerade läuft" subtitle="Letzte Aktivität je Ablauf" />
        {loadingActivity ? (
          <div className="px-5 py-6 text-sm text-slate-400">Lade Aktivität…</div>
        ) : activity.length === 0 ? (
          <EmptyState icon={Inbox} title="Noch keine Ausführungen" hint="Sobald Bernd loslegt, siehst du es hier." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {activity.map((a, i) => (
              <li key={`${a.flow_label}-${i}`} className="flex items-center gap-3 px-5 py-3">
                <StatusDot color={STATUS_DOT[a.status]} pulse={a.status === 'läuft'} />
                <span className="flex-1 text-sm text-slate-600">
                  <span className="font-semibold text-slate-800">{a.flow_label}</span> {STATUS_LABEL[a.status]}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(a.when).toLocaleString('de-AT', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Kanäle */}
      <Card>
        <CardHeader icon={Radio} title="Kanäle" subtitle="So erreichst du Bernd" />
        <div className="p-4">
          <ChannelBadgeList channels={channels} />
        </div>
      </Card>
    </div>
  );
}
