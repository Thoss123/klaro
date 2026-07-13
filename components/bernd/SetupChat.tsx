"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Loader2, RefreshCw, PartyPopper, User } from 'lucide-react';
import { ConnectButton } from '@/components/bernd/ConnectButton';
import { UploadSlot } from '@/components/bernd/UploadSlot';
import OptionsCard, { parseOptionsTag } from '@/components/chat/OptionsCard';
import { stripInternalTags } from '@/lib/strip-internal-tags';
import { splitVisibleStream, type SetupTag } from '@/lib/bernd/setup-tags';
import { evaluateGate, buildGateStatusText } from '@/lib/bernd/gate';
import { SCOPE_LABELS } from '@/lib/bernd/scopes';
import type { BerndSetupState } from '@/lib/bernd/types';

/**
 * Setup-Chat gegen die SSE-Route `POST /api/bernd/setup` (WP2-Vertrag, Architekturplan §WP3
 * Aufgabe 1). Streamt Bernds Prosa live, verarbeitet seine Steuer-Tags am Ende jeder Runde
 * (`done`-Event liefert bereits den autoritativen `state` + `cleanText`) und bettet
 * Verbindungs-/Upload-Bausteine sowie `<options>`-Auswahlen direkt im Gesprächsverlauf ein.
 */

interface SetupChatProps {
  projectId: string;
  initialState: BerndSetupState;
  emailConnected: boolean;
  telegramConnected: boolean;
  onStateChange: (state: BerndSetupState) => void;
  onDeployed: () => void;
  /**
   * Optional: feuert, sobald ein inline gerenderter ConnectButton "verbunden" meldet — die
   * Page hält den Verbindungsstatus (siehe `emailConnected`/`telegramConnected`-Props) und
   * hebt ihn hier an, damit das Gate ohne Reload sofort den frischen Stand sieht. Ohne
   * Callback bleibt der Chip lokal grün (ConnectButton hat einen eigenen Optimistic-State),
   * nur die gate-Berechnung dieser Komponente würde bis zum nächsten Prop-Update hinken.
   */
  onConnectionChange?: (tool: 'email' | 'telegram') => void;
}

interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface BubbleItem {
  kind: 'bubble';
  id: string;
  role: 'user' | 'assistant';
  /** Sichtbarer, bereits von Steuer-Tags befreiter Anzeigetext. */
  display: string;
  /** Nur bei role="assistant": Rohtext inkl. eines evtl. `<options>`-Blocks (für OptionsCard). */
  raw?: string;
  streaming?: boolean;
  failed?: boolean;
}

interface ConnectItem {
  kind: 'connect';
  id: string;
  tool: 'email' | 'telegram';
}

interface UploadItem {
  kind: 'upload';
  id: string;
  typ: string;
  anzahl: number;
}

type ChatItem = BubbleItem | ConnectItem | UploadItem;

/** Sentinel, muss mit SETUP_KICKOFF in app/api/bernd/setup/route.ts übereinstimmen. */
const SETUP_KICKOFF = '__setup_kickoff__';

let idSeq = 0;
function newId(): string {
  idSeq += 1;
  return `si-${idSeq}`;
}

/** Bernds eigener Tag-Namensraum, siehe SetupTagName in lib/bernd/setup-tags.ts (nur zum
 *  Verbergen im live wachsenden Streaming-Puffer — die eigentliche Auswertung passiert
 *  serverseitig via parseSetupTags, hier geht es nur um die Anzeige während des Tippens). */
const BERND_TAG_NAMES = [
  'profil',
  'scope',
  'ablauf',
  'ziel',
  'regel',
  'einschaetzung',
  'fortschritt',
  'zukunft',
  'getcredential',
  'wissen_anfrage',
  'zusammenfassung_bestaetigt',
] as const;

/**
 * `splitVisibleStream` hält nur einen wirklich unvollständigen Tag-Anfang zurück (kein `>` im
 * Puffer). Sobald ein öffnendes Tag wie `<profil feld="gewerk">` komplett getippt ist, würde es
 * sonst kurz als Rohtext aufblitzen, bevor die Runde fertig ist und `parseSetupTags` serverseitig
 * greift. Gleiche Strategie wie `stripInternalTags`: Klammer bis Ende-Tag ODER bis zum
 * Pufferende, falls die Klammer noch offen ist.
 */
function stripLiveBerndTags(text: string): string {
  let out = text;
  for (const name of BERND_TAG_NAMES) {
    out = out.replace(new RegExp(`<\\s*${name}\\b[^>]*?(?:/>|>[\\s\\S]*?<\\s*/\\s*${name}\\s*>)`, 'gi'), '');
    out = out.replace(new RegExp(`<\\s*${name}\\b[^>]*$`, 'gi'), '');
  }
  return out;
}

export function SetupChat({
  projectId,
  initialState,
  emailConnected,
  telegramConnected,
  onStateChange,
  onDeployed,
  onConnectionChange,
}: SetupChatProps) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [history, setHistory] = useState<HistoryTurn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupState, setSetupState] = useState<BerndSetupState>(initialState);
  const [dismissedOptionsId, setDismissedOptionsId] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastSentRef = useRef<{ message: string; hidden: boolean } | null>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
  };

  // Gate wird nach jeder Runde UND bei jeder Änderung der Verbindungs-Props (z.B. Gmail wurde
  // gerade inline verbunden, ohne dass eine neue Chat-Runde lief) neu bewertet.
  const gate = useMemo(
    () => evaluateGate({ setupState, emailConnected, telegramConnected }),
    [setupState, emailConnected, telegramConnected],
  );
  const gateStatusText = useMemo(() => buildGateStatusText(gate), [gate]);

  const updateItem = useCallback((id: string, patch: Partial<BubbleItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.kind === 'bubble' && item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const appendItems = useCallback((newItems: ChatItem[]) => {
    setItems((prev) => [...prev, ...newItems]);
  }, []);

  const send = useCallback(
    async (message: string, hidden = false) => {
      const text = message.trim();
      if (!text || sending) return;
      setError(null);
      lastSentRef.current = { message: text, hidden };

      if (!hidden) {
        setInput('');
        appendItems([{ kind: 'bubble', id: newId(), role: 'user', display: text }]);
        setHistory((prev) => [...prev, { role: 'user', content: text }]);
      }

      const assistantId = newId();
      appendItems([{ kind: 'bubble', id: assistantId, role: 'assistant', display: '', streaming: true }]);
      setSending(true);
      scrollToBottom();

      let buffer = '';

      try {
        const res = await fetch('/api/bernd/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, message: text, history, gateStatus: gateStatusText }),
        });
        if (!res.ok || !res.body) {
          const b = await res.json().catch(() => null);
          throw new Error(b?.error || `Fehlgeschlagen (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';

        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const parts = sseBuffer.split('\n\n');
          sseBuffer = parts.pop() ?? '';

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            const data = JSON.parse(payload) as
              | { type: 'delta'; text: string }
              | { type: 'done'; state: BerndSetupState; uiTags: SetupTag[]; cleanText: string }
              | { type: 'error'; message: string };

            if (data.type === 'delta') {
              buffer += data.text;
              const { visible } = splitVisibleStream(buffer);
              updateItem(assistantId, { display: stripInternalTags(stripLiveBerndTags(visible)) });
              scrollToBottom();
            } else if (data.type === 'error') {
              throw new Error(data.message);
            } else if (data.type === 'done') {
              const displayFinal = stripInternalTags(data.cleanText);
              updateItem(assistantId, { display: displayFinal, raw: data.cleanText, streaming: false });
              setHistory((prev) => [...prev, { role: 'assistant', content: data.cleanText }]);
              setSetupState(data.state);
              onStateChange(data.state);

              const inlineItems: ChatItem[] = [];
              for (const tag of data.uiTags) {
                if (tag.type === 'getcredential') {
                  inlineItems.push({ kind: 'connect', id: newId(), tool: tag.tool });
                } else if (tag.type === 'wissen_anfrage') {
                  inlineItems.push({ kind: 'upload', id: newId(), typ: tag.typ, anzahl: tag.anzahl });
                }
              }
              if (inlineItems.length > 0) appendItems(inlineItems);
            }
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Verbindung unterbrochen.';
        setError(msg);
        updateItem(assistantId, {
          display: 'Das hat gerade nicht geklappt — magst du es nochmal versuchen?',
          streaming: false,
          failed: true,
        });
      } finally {
        setSending(false);
        scrollToBottom();
      }
    },
    [sending, projectId, history, gateStatusText, appendItems, updateItem, onStateChange],
  );

  // Kickoff: einmalig beim Mount Bernds Eröffnung anstoßen (verdeckte Nutzer-Nachricht,
  // analog WELCOME_KICKOFF in AenderungsChat.tsx).
  const didKickoff = useRef(false);
  useEffect(() => {
    if (didKickoff.current) return;
    didKickoff.current = true;
    void send(SETUP_KICKOFF, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = () => {
    const last = lastSentRef.current;
    if (!last) return;
    // Die fehlgeschlagene Bubble bleibt sichtbar (Verlauf soll ehrlich bleiben) — es wird
    // einfach eine frische Runde mit derselben Nachricht angehängt.
    void send(last.message, last.hidden);
  };

  // Inline-Elemente wie OAuth oder Wissen werden nach der Assistant-Bubble angehängt. Deshalb
  // muss hier die jüngste Assistant-Bubble gesucht werden und nicht bloß das letzte Chat-Item.
  const activeOptions = useMemo(() => {
    if (sending) return null;
    const last = items.findLast((item): item is BubbleItem => item.kind === 'bubble' && item.role === 'assistant');
    if (!last || last.kind !== 'bubble' || last.role !== 'assistant' || last.id === dismissedOptionsId) return null;
    const parsed = parseOptionsTag(last.raw ?? last.display);
    return parsed ? { options: parsed, itemId: last.id } : null;
  }, [items, sending, dismissedOptionsId]);

  const readyToDeploy = gate.canStart && Boolean(setupState.zusammenfassung_bestaetigt);

  const handleDeploy = async () => {
    if (deploying) return;
    setDeploying(true);
    setError(null);
    try {
      const res = await fetch('/api/bernd/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        const deployed = (data.deployed ?? []) as { scope: string; slug: string; workflowId: string }[];
        const failed = (data.failed ?? []) as { scope: string; error: string }[];
        const lines = deployed.map((d) => `– ${SCOPE_LABELS[d.scope] ?? d.scope}`).join('\n');
        let msg = 'Bernd ist eingestellt 👋 Er kümmert sich ab jetzt um:';
        if (lines) msg += `\n${lines}`;
        if (failed.length > 0) {
          msg += `\n\nBei folgenden Aufgaben hat es noch nicht geklappt:\n${failed
            .map((f) => `– ${SCOPE_LABELS[f.scope] ?? f.scope}: ${f.error}`)
            .join('\n')}`;
        }
        appendItems([{ kind: 'bubble', id: newId(), role: 'assistant', display: msg }]);
        onDeployed();
      } else if (res.status === 409) {
        const missing = (data.missing ?? []) as string[];
        appendItems([
          {
            kind: 'bubble',
            id: newId(),
            role: 'assistant',
            display: `Fast geschafft — es fehlt noch: ${missing.join(', ') || 'ein paar Angaben'}.`,
          },
        ]);
      } else {
        throw new Error(data.error || `Fehlgeschlagen (${res.status})`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Einstellen fehlgeschlagen.');
    } finally {
      setDeploying(false);
      scrollToBottom();
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        {items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-16 text-sm text-slate-400">
            <Loader2 size={15} className="mr-2 animate-spin" /> Bernd meldet sich gleich…
          </div>
        ) : (
          items.map((item) => {
            if (item.kind === 'connect') {
              return (
                <div key={item.id} className="self-start">
                  <ConnectButton
                    projectId={projectId}
                    tool={item.tool}
                    connected={item.tool === 'email' ? emailConnected : telegramConnected}
                    onConnected={(tool) => onConnectionChange?.(tool as 'email' | 'telegram')}
                  />
                </div>
              );
            }
            if (item.kind === 'upload') {
              return (
                <div key={item.id} className="self-start">
                  <UploadSlot
                    projectId={projectId}
                    typ={item.typ}
                    anzahl={item.anzahl}
                    onUploaded={(_typ, _paths, state) => {
                      // Integrations-Fix: ohne diesen Handler blieb das optionale Gate-Item
                      // "Stilproben hochgeladen" immer offen, weil setup_state nie den
                      // Upload-Erfolg sah (siehe app/api/bernd/wissen/route.ts). Die Route
                      // liefert den bereits gemergten State zurück.
                      if (state) {
                        setSetupState(state);
                        onStateChange(state);
                      }
                    }}
                  />
                </div>
              );
            }
            return item.role === 'user' ? (
              <div key={item.id} className="flex max-w-[88%] items-end gap-2 self-end">
                <div className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-sm leading-relaxed text-white">
                  {item.display}
                </div>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                  <User size={14} />
                </span>
              </div>
            ) : (
              <div key={item.id} className="group max-w-[92%] self-start">
                <div
                  className={`whitespace-pre-wrap text-sm leading-7 ${
                    item.failed
                      ? 'border-l-2 border-red-300 pl-3 text-red-700'
                      : 'text-slate-800'
                  }`}
                >
                  {item.display || (item.streaming ? '…' : '')}
                  {item.failed && (
                    <button
                      type="button"
                      onClick={retry}
                      className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-800"
                    >
                      <RefreshCw size={12} /> Erneut versuchen
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
        {sending && !items.some((i) => i.kind === 'bubble' && i.streaming) && (
          <div className="flex items-center gap-2 self-start text-xs text-slate-400">
            <Loader2 size={13} className="animate-spin" /> Bernd denkt nach…
          </div>
        )}
        <div ref={bottomRef} />
        </div>
      </div>

      <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto w-full max-w-2xl">
          {readyToDeploy && (
            <button
              type="button"
              onClick={handleDeploy}
              disabled={deploying}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
            {deploying ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Bernd wird eingestellt…
              </>
            ) : (
              <>
                <PartyPopper size={16} /> Bernd einstellen
              </>
            )}
            </button>
          )}

          {error && <p className="mb-2 px-1 text-xs text-red-600">{error}</p>}
          {activeOptions ? (
            <OptionsCard
              options={activeOptions.options}
              onSelect={(label) => {
                setDismissedOptionsId(activeOptions.itemId);
                void send(label);
              }}
              onCustomSubmit={(text) => {
                setDismissedOptionsId(activeOptions.itemId);
                void send(text);
              }}
              onDismiss={() => setDismissedOptionsId(activeOptions.itemId)}
            />
          ) : (
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder="Bernd antworten …"
                disabled={sending}
                rows={1}
                className="min-h-10 max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void send(input)}
                disabled={sending || !input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:pointer-events-none disabled:bg-slate-200 disabled:text-slate-400"
                aria-label="Senden"
                title="Senden"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={17} />}
              </button>
            </div>
          )}
        </div>
      </footer>
    </section>
  );
}
