"use client"

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Activity } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getTemplateManifest } from '@/lib/bernd/templates';
import type { BerndConfig } from '@/lib/bernd/types';
import { ChannelBadgeList, type ChannelBadgeData } from '@/components/bernd/ChannelBadge';

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

const STATUS_DOT: Record<LatestActivity['status'], string> = {
  ok: 'bg-green-500',
  fehler: 'bg-red-500',
  läuft: 'bg-amber-500',
  unbekannt: 'bg-gray-300',
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
        const flows = (data.flows ?? []) as Array<{ name: string; runs: Array<{ status: LatestActivity['status']; when: string }> }>;
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

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Was Bernd kann</h3>
        {activeTemplates.length === 0 ? (
          <p className="text-sm text-gray-400">Noch keine Anwendungsfälle aktiviert.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {activeTemplates.map((t) => {
              const manifest = getTemplateManifest(t.slug);
              return (
                <li
                  key={t.slug}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800"
                >
                  <CheckCircle2 size={16} className="text-indigo-600 shrink-0" />
                  {manifest?.label ?? t.slug}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Was gerade läuft</h3>
        {loadingActivity ? (
          <p className="text-sm text-gray-400">Lade Aktivität…</p>
        ) : activity.length === 0 ? (
          <p className="text-sm text-gray-400">Noch keine Ausführungen.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {activity.map((a, i) => (
              <li
                key={`${a.flow_label}-${i}`}
                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700"
              >
                <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[a.status]}`} />
                <Activity size={14} className="text-gray-400 shrink-0" />
                <span className="flex-1">
                  <span className="font-medium text-gray-900">{a.flow_label}</span> {STATUS_LABEL[a.status]}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(a.when).toLocaleString('de-AT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Kanäle</h3>
        <ChannelBadgeList channels={channels} />
      </section>
    </div>
  );
}
