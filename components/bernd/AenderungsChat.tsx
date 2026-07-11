"use client";

import React, { useRef, useState } from 'react';
import { Send, Loader2, HardHat, MessagesSquare } from 'lucide-react';
import { Card, CardHeader } from '@/components/bernd/ui';

interface AenderungsChatProps {
  projectId: string;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Schnellvorschläge für den leeren Zustand — senken die Hemmschwelle, den Chat zu nutzen. */
const SUGGESTIONS = [
  'Setz meinen Stundensatz auf 95 €',
  'Bei Rechnungs-Mails musst du dich nicht melden',
  'Merk dir: Notdienst immer sofort beantworten',
];

/**
 * Änderungs-Chat des Bernd-Dashboards ("Was willst du an Bernd ändern?",
 * Architekturplan §5 Screen 3c): sendet Nachricht + Verlauf an /api/bernd/change,
 * das dieselbe Konfig-Tool-Schicht wie der Telegram-Router nutzt (lib/bernd/config-tools.ts).
 */
export function AenderungsChat({ projectId }: AenderungsChatProps) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
  };

  const send = async (message: string) => {
    const text = message.trim();
    if (!text || sending) return;
    setError(null);
    setInput('');
    const history = turns;
    setTurns((prev) => [...prev, { role: 'user', content: text }]);
    setSending(true);
    scrollToBottom();

    try {
      const res = await fetch('/api/bernd/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, message: text, history }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Änderung fehlgeschlagen (${res.status})`);
      }
      const data = await res.json();
      const answer: string = data.text || 'Dazu habe ich gerade keine Antwort gefunden.';
      setTurns((prev) => [...prev, { role: 'assistant', content: answer }]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Änderung fehlgeschlagen.';
      setError(msg);
      setTurns((prev) => [...prev, { role: 'assistant', content: `Das hat nicht geklappt: ${msg}` }]);
    } finally {
      setSending(false);
      scrollToBottom();
    }
  };

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader
        icon={MessagesSquare}
        title="Was willst du an Bernd ändern?"
        subtitle="Preise, Wissen, Melde-Regeln oder Flows — sag es einfach"
      />

      {/* Verlauf */}
      <div className="flex max-h-[26rem] min-h-[16rem] flex-col gap-3 overflow-y-auto bg-slate-50/40 p-4">
        {turns.length === 0 ? (
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
                <div className="rounded-2xl rounded-bl-md border border-slate-200/70 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm">
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
            placeholder="z. B. Setz meinen Stundensatz auf 95 €"
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
