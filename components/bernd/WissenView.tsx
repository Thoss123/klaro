"use client"

import React, { useEffect, useState } from 'react';
import { FileText, Save, Loader2, BookOpen, Check } from 'lucide-react';
import { Card, CardHeader, EmptyState, PRIMARY_BTN } from '@/components/bernd/ui';

interface WissenViewProps {
  projectId: string;
}

interface FileMeta {
  path: string;
  version: number;
  updated_at: string;
}

const PATH_LABELS: Record<string, string> = {
  'rules/company_base.md': 'Firmen-Basiswissen',
};

function labelForPath(path: string): string {
  if (PATH_LABELS[path]) return PATH_LABELS[path];
  if (path.startsWith('rules/persona_')) return `Persona: ${path.replace('rules/persona_', '').replace('.md', '')}`;
  if (path.startsWith('prompts/')) return `Textbaustein: ${path.replace('prompts/', '').replace('.md', '')}`;
  return path;
}

/**
 * "Bernds Wissen": listet + editiert workspace_files (company_base.md, persona,
 * Textbausteine). Lesbar mit version/updated_at, Speichern via PUT /api/bernd/knowledge
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

  return (
    <Card>
      <CardHeader icon={BookOpen} title="Bernds Wissen" subtitle="Was Bernd über deinen Betrieb weiß" />

      {loading ? (
        <div className="px-5 py-6 text-sm text-slate-400">Lade Wissen…</div>
      ) : files.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Noch kein Wissen hinterlegt"
          hint="Nach dem Onboarding legt Bernd hier Firmenwissen, Preise und Textbausteine ab — alles jederzeit bearbeitbar."
        />
      ) : (
        <div className="grid gap-0 sm:grid-cols-[240px_1fr]">
          {/* Datei-Liste */}
          <div className="flex flex-col gap-1 border-b border-slate-100 p-3 sm:border-b-0 sm:border-r">
            {files.map((f) => {
              const active = selectedPath === f.path;
              return (
                <button
                  key={f.path}
                  onClick={() => setSelectedPath(f.path)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    active
                      ? 'bg-indigo-50 font-semibold text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <FileText size={15} className={`shrink-0 ${active ? 'text-indigo-500' : 'text-slate-400'}`} />
                  <span className="truncate">{labelForPath(f.path)}</span>
                </button>
              );
            })}
          </div>

          {/* Editor */}
          <div className="flex flex-col gap-3 p-4">
            {selectedMeta && (
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
                  Version {selectedMeta.version}
                </span>
                <span>
                  Zuletzt geändert{' '}
                  {new Date(selectedMeta.updated_at).toLocaleString('de-AT', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            )}

            {loadingContent ? (
              <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={16}
                spellCheck={false}
                className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/40 p-4 font-mono text-[13px] leading-relaxed text-slate-800 transition-colors focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex items-center gap-3">
              <button onClick={handleSave} disabled={saving || loadingContent} className={PRIMARY_BTN}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Speichern
              </button>
              {justSaved && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <Check size={14} /> Gespeichert
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
