"use client"

import React, { useEffect, useState } from 'react';
import { FileText, Save, Loader2 } from 'lucide-react';

interface WissenViewProps {
  projectId: string;
}

interface FileMeta {
  path: string;
  version: number;
  updated_at: string;
}

const PATH_LABELS: Record<string, string> = {
  'rules/company_base.md': 'Firmen-Basiswissen (Fakten, Preise, No-Gos)',
};

function labelForPath(path: string): string {
  if (PATH_LABELS[path]) return PATH_LABELS[path];
  if (path.startsWith('rules/persona_')) return `Persona: ${path.replace('rules/persona_', '').replace('.md', '')}`;
  if (path.startsWith('prompts/')) return `Textbaustein: ${path.replace('prompts/', '').replace('.md', '')}`;
  return path;
}

/**
 * "Bernds Wissen": listet + editiert workspace_files (company_base.md, persona,
 * Textbausteine). Lesbar mit version/updated_by, Speichern via PUT /api/bernd/knowledge
 * (Architekturplan §5 Screen 3b).
 */
export function WissenView({ projectId }: WissenViewProps) {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Datei-Liste laden (Neuladen via reloadKey nach dem Speichern). Async-Loader im
  // Effect-Body — so wird setState nicht synchron aus einer externen Funktion gerufen.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/bernd/knowledge?projectId=${encodeURIComponent(projectId)}`);
        if (!res.ok) throw new Error('Wissen konnte nicht geladen werden');
        const data = await res.json();
        const list: FileMeta[] = data.files ?? [];
        if (cancelled) return;
        setFiles(list);
        setSelectedPath((prev) => prev ?? (list.length > 0 ? list[0].path : null));
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Wissen konnte nicht geladen werden');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadKey]);

  // „Gespeichert."-Hinweis nach 4s ausblenden (kein Date.now() im Render).
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 4000);
    return () => clearTimeout(t);
  }, [justSaved]);

  useEffect(() => {
    if (!selectedPath) return;
    let cancelled = false;
    const loadContent = async () => {
      setLoadingContent(true);
      try {
        const res = await fetch(
          `/api/bernd/knowledge?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(selectedPath)}`,
        );
        if (!res.ok) throw new Error('Datei konnte nicht geladen werden');
        const data = await res.json();
        if (!cancelled) setContent(data.content ?? '');
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Datei konnte nicht geladen werden');
      } finally {
        if (!cancelled) setLoadingContent(false);
      }
    };
    loadContent();
    return () => {
      cancelled = true;
    };
  }, [selectedPath, projectId]);

  const handleSave = async () => {
    if (!selectedPath) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/bernd/knowledge', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, path: selectedPath, content }),
      });
      if (!res.ok) throw new Error('Speichern fehlgeschlagen');
      setJustSaved(true);
      setReloadKey((k) => k + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const selectedMeta = files.find((f) => f.path === selectedPath);

  if (loading) {
    return <p className="text-sm text-gray-400">Lade Wissen…</p>;
  }

  if (files.length === 0) {
    return <p className="text-sm text-gray-400">Bernd hat noch kein Wissen hinterlegt.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
      <div className="flex flex-col gap-1">
        {files.map((f) => (
          <button
            key={f.path}
            onClick={() => setSelectedPath(f.path)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              selectedPath === f.path
                ? 'bg-indigo-50 text-indigo-700 font-semibold'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <FileText size={14} className="shrink-0" />
            <span className="truncate">{labelForPath(f.path)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {selectedMeta && (
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Version {selectedMeta.version}</span>
            <span>
              Zuletzt geändert {new Date(selectedMeta.updated_at).toLocaleString('de-AT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}

        {loadingContent ? (
          <p className="text-sm text-gray-400">Lade Datei…</p>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={16}
            className="w-full rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-800 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || loadingContent}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Speichern
          </button>
          {justSaved && (
            <span className="text-xs text-green-600 font-medium">Gespeichert.</span>
          )}
        </div>
      </div>
    </div>
  );
}
