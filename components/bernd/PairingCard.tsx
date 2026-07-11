"use client";

import React, { useEffect, useState } from 'react';
import { Send, Loader2, CheckCircle2, RefreshCw } from 'lucide-react';
import { Card } from '@/components/bernd/ui';

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
 * Pollt kurz nach dem Öffnen, damit der Status nach dem Koppeln automatisch auf
 * „verbunden" wechselt. Bewusst prominent — das ist der Schlüsselschritt für neue Nutzer.
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Kurzes Polling: sobald der Nutzer in Telegram "Start" tippt, wechselt die Karte
  // ohne manuelles Neuladen auf "verbunden".
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
      <Card className="flex items-center gap-2 px-5 py-4 text-sm text-slate-400">
        <Loader2 size={15} className="animate-spin" /> Verbindung wird geprüft…
      </Card>
    );
  }

  // Verbunden: ruhige, bestätigende Karte.
  if (status?.linked) {
    return (
      <Card className="flex items-center gap-3 border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm shadow-emerald-500/30">
          <CheckCircle2 size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-900">Telegram ist verbunden</p>
          <p className="text-xs text-emerald-700/80">
            Schreib, sprich oder fotografiere Bernd direkt im Chat — er antwortet dir dort.
          </p>
        </div>
      </Card>
    );
  }

  const deepLink = status?.code ? `https://t.me/${botUsername()}?start=${status.code}` : undefined;

  // Nicht verbunden: prominenter Call-to-Action mit Telegram-Akzent.
  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[#229ED9]/10 blur-2xl"
      />
      <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#229ED9] text-white shadow-sm shadow-[#229ED9]/30">
            <Send size={20} />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Bernd mit Telegram verbinden</p>
            <p className="mt-0.5 text-sm leading-relaxed text-slate-500">
              Tippe den Button, öffne den Chat und drücke <span className="font-medium text-slate-600">„Start&ldquo;</span>.
              Danach arbeitet ihr direkt über Telegram zusammen.
            </p>
            {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
          {deepLink && (
            <a
              href={deepLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#229ED9] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#229ED9]/30 transition-all hover:bg-[#1b8ec2] active:scale-[0.98]"
            >
              <Send size={16} /> In Telegram öffnen
            </a>
          )}
          <button
            type="button"
            onClick={requestNewCode}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600"
          >
            <RefreshCw size={12} /> Neuer Code
          </button>
        </div>
      </div>
    </Card>
  );
}
