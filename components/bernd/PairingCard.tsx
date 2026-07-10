"use client";

import React, { useEffect, useState } from 'react';
import { MessageCircle, Loader2, CheckCircle2 } from 'lucide-react';

interface PairingCardProps {
  projectId: string;
}

interface PairStatus {
  linked: boolean;
  code?: string;
  chat_id?: string;
}

const FALLBACK_BOT = 'AxantiloBerndBot';

function botUsername(): string {
  return process.env.NEXT_PUBLIC_TELEGRAM_BOT?.trim() || FALLBACK_BOT;
}

/**
 * Telegram-Pairing-Karte fürs Bernd-Dashboard (Architekturplan §5, Punkt 4): zeigt den
 * Deep-Link `t.me/<bot>?start=<code>` und lädt/erzeugt den Code über `/api/bernd/pair`.
 * Pollt kurz nach dem Öffnen, damit der Status nach dem Koppeln in Telegram automatisch
 * auf „verbunden" wechselt, ohne dass der Nutzer manuell neu laden muss.
 */
export function PairingCard({ projectId }: PairingCardProps) {
  const [status, setStatus] = useState<PairStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const res = await fetch(`/api/bernd/pair?projectId=${encodeURIComponent(projectId)}`);
      if (!res.ok) throw new Error('Pairing-Status konnte nicht geladen werden');
      const data: PairStatus = await res.json();
      setStatus(data);
      if (!data.linked && !data.code) {
        await requestNewCode();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Pairing-Status konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const requestNewCode = async () => {
    try {
      const res = await fetch('/api/bernd/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) throw new Error('Pairing-Code konnte nicht erzeugt werden');
      const data: PairStatus = await res.json();
      setStatus(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Pairing-Code konnte nicht erzeugt werden');
    }
  };

  // Lädt den Pairing-Status beim Mount/Projektwechsel — echter Datenfetch-Side-Effect,
  // kein Render-Zeit-Ableitungsfall.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Kurzes Polling nach dem Öffnen: sobald der Nutzer in Telegram "Start" tippt,
  // soll die Karte ohne manuelles Neuladen auf "verbunden" wechseln.
  useEffect(() => {
    if (loading || status?.linked) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/bernd/pair?projectId=${encodeURIComponent(projectId)}`);
        if (!res.ok) return;
        const data: PairStatus = await res.json();
        setStatus(data);
      } catch {
        // Polling-Fehler ignorieren — nächster Versuch folgt.
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [projectId, loading, status?.linked]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-400">
        <Loader2 size={14} className="animate-spin" /> Lade Pairing-Status…
      </div>
    );
  }

  if (status?.linked) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
        <CheckCircle2 size={18} /> Telegram ist mit deinem Betrieb verbunden.
      </div>
    );
  }

  const deepLink = status?.code ? `https://t.me/${botUsername()}?start=${status.code}` : undefined;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <MessageCircle size={16} className="text-indigo-600" /> Telegram koppeln
      </div>
      <p className="text-sm text-gray-500">
        Öffne den Link in Telegram und tippe „Start” — danach erreichst du Bernd direkt im Chat.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {deepLink && (
        <a
          href={deepLink}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          <MessageCircle size={16} /> Mit Telegram verbinden
        </a>
      )}
      <button
        type="button"
        onClick={requestNewCode}
        className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors self-start"
      >
        Neuen Code erzeugen
      </button>
    </div>
  );
}
