"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Mail } from 'lucide-react';
import { Card, PRIMARY_BTN } from '@/components/bernd/ui';
import { PairingCard } from '@/components/bernd/PairingCard';

export interface ConnectButtonProps {
  projectId: string;
  tool: 'email' | 'telegram';
  connected: boolean;
  onConnected?: (tool: string) => void;
}

const GMAIL_TOOL_NAME = 'gmail';
const GMAIL_CREDENTIAL_TYPE = 'gmailOAuth2Api';

/**
 * Inline-Verbindungs-Baustein für Bernds Setup-Chat (`<getcredential tool="email|telegram"/>`,
 * siehe Architekturplan §WP4). Rendert an der Stelle im Chat, an der das Tag steht.
 *
 * tool="email": öffnet den bestehenden Google-OAuth-Broker
 * (`app/api/oauth/[provider]/route.ts` + `callback/[provider]/route.ts`, Provider "google")
 * in einem Popup und lauscht auf die postMessage `axantilo_oauth`, die der Callback an
 * `window.opener` sendet — kein eigener OAuth-Code, volle Wiederverwendung.
 *
 * tool="telegram": bettet die bestehende `PairingCard` (Code + Deep-Link + 4s-Polling,
 * `app/api/bernd/pair/route.ts`) ein und reicht deren `onLinked`-Callback nach außen durch.
 *
 * `connected` kommt vom Elternteil (z.B. aus `setup_state.credentials`/Gate); zusätzlich hält
 * die Komponente einen lokalen Status, damit der Chip sofort nach dem Verbinden erscheint,
 * auch bevor der Elternteil neu rendert.
 */
export function ConnectButton({ projectId, tool, connected, onConnected }: ConnectButtonProps) {
  const [localConnected, setLocalConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = connected || localConnected;

  // Popup-Ergebnis des OAuth-Callbacks entgegennehmen (nur relevant für tool="email").
  useEffect(() => {
    if (tool !== 'email') return;
    function onMessage(e: MessageEvent) {
      // Nur Nachrichten von der eigenen Origin akzeptieren (der Callback läuft auf derselben
      // Origin wie diese Seite — Popup und Opener teilen sich window.location.origin).
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; ok?: boolean; toolName?: string; error?: string };
      if (data?.type !== 'axantilo_oauth') return;
      setConnecting(false);
      if (data.ok) {
        setError(null);
        setLocalConnected(true);
        onConnected?.('email');
      } else {
        setError(data.error || 'Verbindung fehlgeschlagen. Bitte erneut versuchen.');
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [tool, onConnected]);

  const connectGmail = useCallback(() => {
    setError(null);
    setConnecting(true);
    const returnUrl = window.location.pathname + window.location.search;
    const url = `/api/oauth/google?${new URLSearchParams({
      project_id: projectId,
      tool_name: GMAIL_TOOL_NAME,
      n8n_credential_type: GMAIL_CREDENTIAL_TYPE,
      return_url: returnUrl,
    }).toString()}`;
    const popup = window.open(url, 'axantilo_oauth', 'width=500,height=650');
    if (!popup) {
      // Popup-Blocker: im selben Tab weiterleiten statt stumm zu scheitern.
      setConnecting(false);
      window.location.href = url;
    }
  }, [projectId]);

  const handleTelegramLinked = useCallback(() => {
    setLocalConnected(true);
    onConnected?.('telegram');
  }, [onConnected]);

  if (isConnected) {
    return (
      <Card className="inline-flex max-w-sm items-center gap-2.5 px-4 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white">
          <CheckCircle2 size={15} />
        </span>
        <span className="text-sm font-medium text-emerald-800">
          {tool === 'email' ? 'E-Mail verbunden' : 'Telegram verbunden'}
        </span>
      </Card>
    );
  }

  if (tool === 'telegram') {
    return (
      <div className="max-w-sm">
        <PairingCard projectId={projectId} onLinked={handleTelegramLinked} />
      </div>
    );
  }

  return (
    <Card className="max-w-sm px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500">
          <Mail size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Postfach verbinden</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            Verbinde dein Gmail-Konto in drei Klicks — Bernd liest und entwirft erst danach Antworten.
          </p>
          {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
          <button
            type="button"
            onClick={connectGmail}
            disabled={connecting}
            className={`${PRIMARY_BTN} mt-3 w-full`}
          >
            {connecting ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Warte auf Bestätigung…
              </>
            ) : (
              <>Gmail verbinden</>
            )}
          </button>
        </div>
      </div>
    </Card>
  );
}
