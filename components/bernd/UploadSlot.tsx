"use client";

import React, { useRef, useState } from 'react';
import { CheckCircle2, FileUp, Loader2, UploadCloud } from 'lucide-react';
import { Card, PRIMARY_BTN } from '@/components/bernd/ui';
import type { BerndSetupState } from '@/lib/bernd/types';

export interface UploadSlotProps {
  projectId: string;
  typ: string;
  anzahl: number;
  label?: string;
  /** `state` ist der von `/api/bernd/wissen` bereits gemergte, autoritative `setup_state`
   *  (siehe Route-Kommentar) — der Aufrufer kann ihn direkt übernehmen, statt die
   *  Merge-Logik aus `lib/bernd/config.ts#mergeSetupState` clientseitig zu duplizieren. */
  onUploaded?: (typ: string, paths: string[], state?: BerndSetupState) => void;
}

/** Fallback-Platzhaltertexte je bekanntem Wissens-Typ (überschreibbar via `label`-Prop). */
const DEFAULT_LABEL: Record<string, string> = {
  mail_stilproben: 'Füge hier eine typische E-Mail-Antwort ein',
  preisliste: 'Füge hier einen Preis- oder Leistungspunkt ein',
};

/**
 * Inline-Upload-Baustein für Bernds Setup-Chat (`<wissen_anfrage typ="…" anzahl="…"/>`,
 * Architekturplan §WP4). Rendert `anzahl` Textfelder (+ optionaler .txt/.md-Datei-Picker je
 * Feld, der den Dateiinhalt per FileReader ins Feld einliest — keine Binär-Uploads) und
 * speichert alle nicht-leeren Einträge gebündelt über POST /api/bernd/wissen.
 */
export function UploadSlot({ projectId, typ, anzahl, label, onUploaded }: UploadSlotProps) {
  // Defensiv begrenzt — `anzahl` kommt aus einem vom Coach-LLM erzeugten Tag.
  const count = Math.max(1, Math.min(anzahl || 1, 10));
  const [texte, setTexte] = useState<string[]>(() => Array.from({ length: count }, () => ''));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const placeholder = label ?? DEFAULT_LABEL[typ] ?? 'Füge hier ein Beispiel ein';

  const setSlot = (i: number, value: string) => {
    setTexte((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  };

  const handleFile = (i: number, file: File | undefined) => {
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name)) {
      setError('Nur .txt- oder .md-Dateien.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setSlot(i, text);
    };
    reader.onerror = () => setError('Datei konnte nicht gelesen werden.');
    reader.readAsText(file);
  };

  const submit = async () => {
    const nonEmpty = texte.map((t) => t.trim()).filter(Boolean);
    if (nonEmpty.length === 0) {
      setError('Bitte mindestens ein Beispiel eintragen.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/bernd/wissen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, typ, texte: nonEmpty }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string })?.error || `Fehlgeschlagen (${res.status})`);
      setSaved(true);
      const path = (data as { path?: string })?.path;
      const state = (data as { state?: BerndSetupState })?.state;
      onUploaded?.(typ, path ? [path] : [], state);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <Card className="inline-flex max-w-sm items-center gap-2.5 px-4 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white">
          <CheckCircle2 size={15} />
        </span>
        <span className="text-sm font-medium text-emerald-800">Gespeichert</span>
      </Card>
    );
  }

  return (
    <Card className="max-w-sm space-y-3 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-1">
          <textarea
            value={texte[i]}
            onChange={(e) => setSlot(i, e.target.value)}
            placeholder={count > 1 ? `${placeholder} (${i + 1})` : placeholder}
            rows={3}
            disabled={saving}
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRefs.current[i]?.click()}
              disabled={saving}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition-colors hover:text-indigo-600 disabled:opacity-50"
            >
              <FileUp size={12} /> .txt/.md hochladen
            </button>
            <input
              ref={(el) => {
                fileInputRefs.current[i] = el;
              }}
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              className="hidden"
              onChange={(e) => handleFile(i, e.target.files?.[0])}
            />
          </div>
        </div>
      ))}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button type="button" onClick={submit} disabled={saving} className={`${PRIMARY_BTN} w-full`}>
        {saving ? (
          <>
            <Loader2 size={15} className="animate-spin" /> Speichern…
          </>
        ) : (
          <>
            <UploadCloud size={15} /> Speichern
          </>
        )}
      </button>
    </Card>
  );
}
