'use client';

import { useCallback, useEffect, useState } from 'react';

type Entry = {
  id: string;
  source_type: string;
  title: string;
  filepath: string;
  is_active: boolean;
  indexed_at: string;
};

type Match = {
  id: string;
  source_type: string;
  title: string;
  filepath: string;
  similarity: number;
};

const SECTIONS: { label: string; folder?: string }[] = [
  { label: 'Alles', folder: undefined },
  { label: 'Tools', folder: 'tools' },
  { label: 'Branchen', folder: 'branchen' },
  { label: 'Use-Cases', folder: 'use-cases' },
  { label: 'Templates', folder: 'templates' },
  { label: 'UI-Guides', folder: 'ui-guides' },
];

const PHASES = ['', 'diagnose', 'analyse', 'plan', 'umsetzung'];

export default function KnowledgeAdminClient() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');

  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState('');
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Upload
  const [upPath, setUpPath] = useState('');
  const [upContent, setUpContent] = useState('');
  const [uploading, setUploading] = useState(false);
  const [upStatus, setUpStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/knowledge');
    const data = await res.json();
    setEntries(data.entries ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function reindex(folder?: string) {
    setBusy(folder ?? 'all');
    setStatus(`Indexiere ${folder ?? 'alles'}…`);
    try {
      const res = await fetch('/api/admin/knowledge/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler');
      setStatus(`✅ ${data.indexed} indexiert, ${data.failed} Fehler.`);
      await load();
    } catch (e) {
      setStatus(`❌ ${e instanceof Error ? e.message : 'Fehler'}`);
    } finally {
      setBusy(null);
    }
  }

  async function upload() {
    if (!upPath.trim() || !upContent.trim()) {
      setUpStatus('Pfad und Inhalt erforderlich.');
      return;
    }
    setUploading(true);
    setUpStatus('Lade hoch & indexiere…');
    try {
      const res = await fetch('/api/admin/knowledge/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filepath: upPath, content: upContent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler');
      setUpStatus(`✅ ${data.entry.filepath} (${data.entry.source_type}) indexiert.`);
      setUpPath('');
      setUpContent('');
      await load();
    } catch (e) {
      setUpStatus(`❌ ${e instanceof Error ? e.message : 'Fehler'}`);
    } finally {
      setUploading(false);
    }
  }

  async function del(id: string) {
    if (!confirm('Diesen Eintrag löschen?')) return;
    await fetch(`/api/admin/knowledge?id=${id}`, { method: 'DELETE' });
    await load();
  }

  async function runSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setMatches(null);
    try {
      const res = await fetch('/api/admin/knowledge/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, phase: phase || undefined }),
      });
      const data = await res.json();
      setMatches(data.matches ?? []);
    } finally {
      setSearching(false);
    }
  }

  const grouped = entries.reduce<Record<string, Entry[]>>((acc, e) => {
    (acc[e.source_type] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-5xl p-6 text-sm">
      <h1 className="mb-1 text-2xl font-semibold">Knowledge Base</h1>
      <p className="mb-6 text-gray-500">
        RAG-Wissensdatenbank — {entries.length} Einträge. Dateien liegen in{' '}
        <code>/knowledge</code> und werden hier indexiert.
      </p>

      {/* Upload */}
      <section className="mb-8 rounded-xl border border-gray-200 p-4">
        <h2 className="mb-3 font-medium">Neue Wissensdatei hochladen</h2>
        <p className="mb-3 text-gray-500">
          Pfad eingeben (z. B. <code>tools/lexoffice.md</code> oder{' '}
          <code>use-cases/branche/handwerk-angebot.md</code>) und das Markdown reinpasten — die
          Datei wird unter <code>/knowledge</code> abgelegt und automatisch indexiert. Der{' '}
          <code>source_type</code> wird aus dem Ordner abgeleitet.
        </p>
        <input
          value={upPath}
          onChange={(e) => setUpPath(e.target.value)}
          placeholder="Pfad, z. B. tools/lexoffice.md"
          className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 font-mono"
        />
        <textarea
          value={upContent}
          onChange={(e) => setUpContent(e.target.value)}
          placeholder={'---\ntype: tool\n...\n---\n\n# Titel\n\nInhalt…'}
          rows={10}
          className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={upload}
            disabled={uploading}
            className="rounded-lg bg-black px-4 py-1.5 text-white disabled:opacity-50"
          >
            {uploading ? '…' : 'Hochladen & Indexieren'}
          </button>
          {upStatus && <span className="text-gray-600">{upStatus}</span>}
        </div>
      </section>

      {/* Reindex */}
      <section className="mb-8 rounded-xl border border-gray-200 p-4">
        <h2 className="mb-3 font-medium">Neu indexieren (aus /knowledge)</h2>
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <button
              key={s.label}
              onClick={() => reindex(s.folder)}
              disabled={busy !== null}
              className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
            >
              {busy === (s.folder ?? 'all') ? '…' : s.label}
            </button>
          ))}
        </div>
        {status && <p className="mt-3 text-gray-600">{status}</p>}
      </section>

      {/* Search test */}
      <section className="mb-8 rounded-xl border border-gray-200 p-4">
        <h2 className="mb-3 font-medium">Such-Test (was der Coach findet)</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder="Test-Query, z. B. „Wie verbinde ich Gmail?“"
            className="min-w-[260px] flex-1 rounded-lg border border-gray-300 px-3 py-1.5"
          />
          <select
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5"
          >
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {p || 'alle Phasen'}
              </option>
            ))}
          </select>
          <button
            onClick={runSearch}
            disabled={searching}
            className="rounded-lg bg-black px-4 py-1.5 text-white disabled:opacity-50"
          >
            {searching ? '…' : 'Suchen'}
          </button>
        </div>
        {matches && (
          <ul className="mt-4 space-y-1">
            {matches.length === 0 && <li className="text-gray-500">Keine Treffer.</li>}
            {matches.map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <span className="w-12 font-mono text-emerald-600">
                  {(m.similarity * 100).toFixed(0)}%
                </span>
                <span className="w-44 text-gray-400">{m.source_type}</span>
                <span>{m.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Overview */}
      <section className="rounded-xl border border-gray-200 p-4">
        <h2 className="mb-3 font-medium">Übersicht</h2>
        {loading ? (
          <p className="text-gray-500">Lädt…</p>
        ) : (
          Object.entries(grouped).map(([type, rows]) => (
            <div key={type} className="mb-4">
              <h3 className="mb-1 font-mono text-xs uppercase text-gray-400">
                {type} ({rows.length})
              </h3>
              <ul className="divide-y divide-gray-100">
                {rows.map((e) => (
                  <li key={e.id} className="flex items-center justify-between py-1.5">
                    <div>
                      <span className="font-medium">{e.title}</span>{' '}
                      <span className="text-gray-400">— {e.filepath}</span>
                    </div>
                    <button
                      onClick={() => del(e.id)}
                      className="text-gray-400 hover:text-red-600"
                    >
                      Löschen
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
