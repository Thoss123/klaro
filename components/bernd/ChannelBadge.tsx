"use client"

import React from 'react';
import { Send, Check, Clock, XCircle, type LucideIcon } from 'lucide-react';
import { Pill } from '@/components/bernd/ui';

/**
 * Kanal-Anzeige für Bernds Steckbrief. Datenmodell absichtlich generisch gehalten
 * (channel/status/handle), damit spätere Kanäle (WhatsApp, Slack, ...) als Liste/Select
 * ohne Umbau ergänzbar sind — heute ist nur "telegram" im Icon/Label-Mapping hinterlegt
 * (Architekturplan §5 Screen 3a).
 */

export type BerndChannel = 'telegram';
export type BerndChannelStatus = 'connected' | 'pending' | 'disconnected';

export interface ChannelBadgeData {
  channel: BerndChannel | string;
  status: BerndChannelStatus;
  handle?: string;
}

interface ChannelMeta {
  label: string;
  icon: LucideIcon;
  tint: string;
}

// Internes Mapping channel → Icon/Label/Farbe. Neue Kanäle: hier einen Eintrag ergänzen.
const CHANNEL_META: Record<string, ChannelMeta> = {
  telegram: { label: 'Telegram', icon: Send, tint: 'bg-[#229ED9]' },
};

const STATUS_META: Record<
  BerndChannelStatus,
  { label: string; tone: 'green' | 'amber' | 'slate'; icon: LucideIcon }
> = {
  connected: { label: 'Verbunden', tone: 'green', icon: Check },
  pending: { label: 'Wartet auf Kopplung', tone: 'amber', icon: Clock },
  disconnected: { label: 'Nicht verbunden', tone: 'slate', icon: XCircle },
};

export function ChannelBadge({ channel, status, handle }: ChannelBadgeData) {
  const meta = CHANNEL_META[channel] ?? { label: channel, icon: Send, tint: 'bg-slate-400' };
  const statusMeta = STATUS_META[status];
  const ChannelIcon = meta.icon;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 px-4 py-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white ${meta.tint}`}>
        <ChannelIcon size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{meta.label}</p>
        {handle ? (
          <p className="truncate text-xs text-slate-500">{handle}</p>
        ) : (
          <p className="text-xs text-slate-400">Noch kein Konto verknüpft</p>
        )}
      </div>
      <Pill tone={statusMeta.tone} icon={statusMeta.icon}>
        {statusMeta.label}
      </Pill>
    </div>
  );
}

/** Liste von Kanal-Badges — heute nur Telegram, aber schon als Liste gebaut. */
export function ChannelBadgeList({ channels }: { channels: ChannelBadgeData[] }) {
  if (channels.length === 0) {
    return <p className="text-sm text-slate-400">Noch keine Kanäle konfiguriert.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {channels.map((c) => (
        <ChannelBadge key={c.channel} {...c} />
      ))}
    </div>
  );
}
