"use client"

import React from 'react';
import { Send, Check, Clock, XCircle, type LucideIcon } from 'lucide-react';

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
}

// Internes Mapping channel → Icon/Label. Neue Kanäle: hier einen Eintrag ergänzen,
// Rest der Komponente (Status-Pille, Layout) bleibt unverändert.
const CHANNEL_META: Record<string, ChannelMeta> = {
  telegram: { label: 'Telegram', icon: Send },
};

const STATUS_META: Record<BerndChannelStatus, { label: string; className: string; icon: LucideIcon }> = {
  connected: { label: 'Verbunden', className: 'bg-green-50 text-green-700 border-green-200', icon: Check },
  pending: { label: 'Wartet auf Kopplung', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  disconnected: { label: 'Nicht verbunden', className: 'bg-gray-100 text-gray-500 border-gray-200', icon: XCircle },
};

export function ChannelBadge({ channel, status, handle }: ChannelBadgeData) {
  const meta = CHANNEL_META[channel] ?? { label: channel, icon: Send };
  const statusMeta = STATUS_META[status];
  const ChannelIcon = meta.icon;
  const StatusIcon = statusMeta.icon;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
        <ChannelIcon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{meta.label}</p>
        {handle ? (
          <p className="text-xs text-gray-500 truncate">{handle}</p>
        ) : (
          <p className="text-xs text-gray-400">Noch kein Konto verknüpft</p>
        )}
      </div>
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusMeta.className}`}
      >
        <StatusIcon size={12} /> {statusMeta.label}
      </span>
    </div>
  );
}

/** Liste von Kanal-Badges — heute nur Telegram, aber schon als Liste gebaut. */
export function ChannelBadgeList({ channels }: { channels: ChannelBadgeData[] }) {
  if (channels.length === 0) {
    return <p className="text-sm text-gray-400">Noch keine Kanäle konfiguriert.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {channels.map((c) => (
        <ChannelBadge key={c.channel} {...c} />
      ))}
    </div>
  );
}
