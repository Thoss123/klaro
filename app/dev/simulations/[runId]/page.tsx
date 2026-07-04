'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';

interface Turn { turn: number; phase: string; role: string; content: string; signals: Record<string, unknown> }
interface Finding {
  ruleId: string; kind: string; phase?: string; passed: boolean;
  severity: string; message: string; evidence?: string; suggestedFix?: string;
}
interface RunDetail {
  run: { persona_slug: string; status: string; phases_run: string[]; verdict: { score: number; pass: boolean } | null; error: string | null };
  transcript: Turn[];
  findings: Finding[];
}

const SEV_COLOR: Record<string, string> = {
  critical: 'border-red-500 bg-red-50',
  high: 'border-orange-400 bg-orange-50',
  medium: 'border-yellow-400 bg-yellow-50',
  low: 'border-blue-300 bg-blue-50',
  info: 'border-gray-200 bg-gray-50',
};

export default function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const [data, setData] = useState<RunDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/dev/simulations/${runId}`)
      .then(async r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch(e => setErr(String(e)));
  }, [runId]);

  if (err) return <div className="p-6 text-red-600">Fehler: {err}</div>;
  if (!data) return <div className="p-6 text-gray-400">Lädt…</div>;

  const failed = data.findings.filter(f => !f.passed);
  const passed = data.findings.filter(f => f.passed);

  return (
    <div className="mx-auto max-w-4xl p-6 text-sm">
      <Link href="/dev/simulations" className="text-blue-600 hover:underline">← Alle Läufe</Link>
      <h1 className="mt-2 mb-1 text-xl font-semibold">{data.run.persona_slug}</h1>
      <p className="mb-4 text-gray-500">
        {data.run.phases_run?.join(' → ')} · Status: {data.run.status}
        {data.run.verdict && (
          <span className={`ml-2 font-medium ${data.run.verdict.pass ? 'text-green-600' : 'text-red-600'}`}>
            Score {data.run.verdict.score} {data.run.verdict.pass ? '(bestanden)' : '(durchgefallen)'}
          </span>
        )}
      </p>
      {data.run.error && <p className="mb-4 rounded bg-red-50 p-3 text-red-700">{data.run.error}</p>}

      <h2 className="mb-2 font-semibold">Findings ({failed.length} Fehler, {passed.length} ok)</h2>
      <div className="mb-6 space-y-2">
        {failed.map((f, i) => (
          <div key={i} className={`rounded border-l-4 p-3 ${SEV_COLOR[f.severity] ?? SEV_COLOR.info}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium">{f.ruleId} <span className="text-gray-400">({f.kind})</span></span>
              <span className="text-xs uppercase">{f.severity}{f.phase ? ` · ${f.phase}` : ''}</span>
            </div>
            <p className="mt-1">{f.message}</p>
            {f.evidence && <p className="mt-1 italic text-gray-600">{`„${f.evidence}"`}</p>}
            {f.suggestedFix && <p className="mt-1 text-gray-500">→ {f.suggestedFix}</p>}
          </div>
        ))}
        {failed.length === 0 && <p className="text-green-600">Keine Regelverstöße. 🎉</p>}
        {passed.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-gray-500">{passed.length} bestandene Regeln</summary>
            <ul className="mt-1 list-disc pl-5 text-gray-500">
              {passed.map((f, i) => <li key={i}>{f.ruleId}: {f.message}</li>)}
            </ul>
          </details>
        )}
      </div>

      <h2 className="mb-2 font-semibold">Transkript</h2>
      <div className="space-y-3">
        {data.transcript.map(t => (
          <div key={t.turn} className={`flex ${t.role === 'coach' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
              t.role === 'coach' ? 'bg-gray-100' : 'bg-blue-600 text-white'
            }`}>
              <div className={`mb-0.5 text-xs ${t.role === 'coach' ? 'text-gray-400' : 'text-blue-100'}`}>
                {t.role === 'coach' ? 'Coach' : 'Kunde'} · {t.phase}
                {t.signals?.phaseComplete ? ` · ✓ ${String(t.signals.phaseComplete)}` : ''}
              </div>
              <div className="whitespace-pre-wrap">{t.content}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
