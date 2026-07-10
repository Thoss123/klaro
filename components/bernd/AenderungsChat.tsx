"use client";

import React, { useRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';

interface AenderungsChatProps {
  projectId: string;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

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

  const handleSend = async () => {
    const message = input.trim();
    if (!message || sending) return;
    setError(null);
    setInput('');
    const history = turns;
    setTurns((prev) => [...prev, { role: 'user', content: message }]);
    setSending(true);
    scrollToBottom();

    try {
      const res = await fetch('/api/bernd/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, message, history }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Änderung fehlgeschlagen (${res.status})`);
      }
      const data = await res.json();
      const text: string = data.text || 'Dazu habe ich gerade keine Antwort gefunden.';
      setTurns((prev) => [...prev, { role: 'assistant', content: text }]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Änderung fehlgeschlagen.';
      setError(msg);
      setTurns((prev) => [...prev, { role: 'assistant', content: `Fehler: ${msg}` }]);
    } finally {
      setSending(false);
      scrollToBottom();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-500">
        Sag Bernd, was du ändern willst — Preise, Wissen, bei welchen Mails er sich meldet,
        oder ob ein Flow pausiert werden soll.
      </p>

      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 max-h-96 overflow-y-auto">
        {turns.length === 0 ? (
          <p className="text-sm text-gray-400">Noch keine Nachrichten — schreib Bernd, was du ändern willst.</p>
        ) : (
          turns.map((t, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                t.role === 'user'
                  ? 'self-end bg-indigo-600 text-white'
                  : 'self-start bg-gray-100 text-gray-800'
              }`}
            >
              {t.content}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="z. B. Setz meinen Stundensatz auf 95 €"
          disabled={sending}
          className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}
