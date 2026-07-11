"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Send, Loader2, HardHat, MessagesSquare } from 'lucide-react';
import { Card, CardHeader } from '@/components/bernd/ui';

interface AenderungsChatProps {
  projectId: string;
  /** 'change' (Dashboard-Änderungs-Chat, Default) oder 'welcome' (Erstgespräch nach Onboarding). */
  mode?: 'change' | 'welcome';
  /** Wenn true: sendet beim Mount einen verdeckten Kickoff, sodass Bernd von selbst begrüßt. */
  kickoff?: boolean;
  title?: string;
  subtitle?: string;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Muss mit WELCOME_KICKOFF in app/api/bernd/change/route.ts übereinstimmen. */
const WELCOME_KICKOFF = '__welcome_kickoff__';

/** Schnellvorschläge für den leeren Zustand (nur im Änderungs-Modus). */
const SUGGESTIONS = [
  'Setz meinen Stundensatz auf 95 €',
  'Bei Rechnungs-Mails musst du dich nicht melden',
  'Merk dir: Notdienst immer sofort beantworten',
];

/**
 * Bernd-Chat für zwei Situationen (Architekturplan §5 Screen 3c):
 * - mode="change": Dashboard-Änderungs-Chat ("Was willst du an Bernd ändern?").
 * - mode="welcome": Erstgespräch direkt nach dem Onboarding — Bernd begrüßt von selbst,
 *   erklärt sich und schließt die Einrichtung ab.
 * Beide nutzen dieselbe Konfig-Tool-Schicht (POST /api/bernd/change).
 */
export function AenderungsChat({ projectId, mode = 'change', kickoff = false, title, subtitle }: AenderungsChatProps) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
  };

  // Gemeinsamer Sende-Pfad. `hidden` = verdeckte Nachricht (Kickoff), deren Nutzer-Bubble
  // NICHT angezeigt wird — nur Bernds Antwort erscheint.
  const send = async (message: string, hidden = false) => {
    const text = message.trim();
    if (!text || sending) return;
    setError(null);
    const history = turns;
    if (!hidden) {
      setInput('');
      setTurns((prev) => [...prev, { role: 'user', content: text }]);
    }
    setSending(true);
    scrollToBottom();

    try {
      const res = await fetch('/api/bernd/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, message: text, history, mode }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error || `Fehlgeschlagen (${res.status})`);
      }
      const data = await res.json();
      const answer: string = data.text || 'Dazu habe ich gerade keine Antwort gefunden.';
      setTurns((prev) => [...prev, { role: 'assistant', content: answer }]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Fehlgeschlagen.';
      setError(msg);
      setTurns((prev) => [...prev, { role: 'assistant', content: `Das hat nicht geklappt: ${msg}` }]);
    } finally {
      setSending(false);
      scrollToBottom();
    }
  };

  // Willkommens-Kickoff: einmalig beim Mount Bernds Begrüßung anstoßen.
  const didKickoff = useRef(false);
  useEffect(() => {
    if (!kickoff || didKickoff.current) return;
    didKickoff.current = true;
    void send(WELCOME_KICKOFF, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kickoff]);

  const heading = title ?? 'Was willst du an Bernd ändern?';
  const sub = subtitle ?? 'Preise, Wissen, Melde-Regeln oder Flows — sag es einfach';
  const showSuggestions = mode === 'change';

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader icon={mode === 'welcome' ? HardHat : MessagesSquare} title={heading} subtitle={sub} />

      {/* Verlauf */}
      <div className="flex max-h-[28rem] min-h-[18rem] flex-col gap-3 overflow-y-auto bg-slate-50/40 p-4">
        {turns.length === 0 && !sending ? (
          showSuggestions ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-sm shadow-indigo-600/25">
                <HardHat size={22} />
              </span>
              <p className="max-w-xs text-sm text-slate-500">
                Sag Bernd in einem Satz, was sich ändern soll. Bei Unklarheit fragt er nach.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center py-8 text-sm text-slate-400">
              <Loader2 size={15} className="mr-2 animate-spin" /> Bernd meldet sich gleich…
            </div>
          )
        ) : (
          turns.map((t, i) =>
            t.role === 'user' ? (
              <div
                key={i}
                className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-gradient-to-b from-indigo-500 to-indigo-600 px-4 py-2.5 text-sm text-white shadow-sm shadow-indigo-600/20"
              >
                {t.content}
              </div>
            ) : (
              <div key={i} className="flex max-w-[90%] items-end gap-2 self-start">
                <span className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/70">
                  <HardHat size={14} />
                </span>
                <div className="whitespace-pre-line rounded-2xl rounded-bl-md border border-slate-200/70 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm">
                  {t.content}
                </div>
              </div>
            ),
          )
        )}
        {sending && (
          <div className="flex items-center gap-2 self-start pl-9 text-xs text-slate-400">
            <Loader2 size={13} className="animate-spin" /> Bernd denkt nach…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Eingabe */}
      <div className="border-t border-slate-100 p-3">
        {error && <p className="mb-2 px-1 text-xs text-red-600">{error}</p>}
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={mode === 'welcome' ? 'Frag Bernd etwas oder nenn ihm deinen Stundensatz…' : 'z. B. Setz meinen Stundensatz auf 95 €'}
            disabled={sending}
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-800 transition-colors placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => send(input)}
            disabled={sending || !input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-sm shadow-indigo-600/25 transition-all hover:from-indigo-500 hover:to-indigo-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            aria-label="Senden"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </Card>
  );
}
