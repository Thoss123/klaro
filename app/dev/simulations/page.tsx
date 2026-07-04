'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface RunRow {
  id: string;
  persona_slug: string;
  label: string | null;
  status: string;
  phases_run: string[];
  verdict: { score: number; pass: boolean } | null;
  started_at: string;
}
interface PersonaRow { slug: string; label: string }

const ALL_PHASES = ['diagnose', 'analyse', 'umsetzung'];

export default function SimulationsPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [personas, setPersonas] = useState<PersonaRow[]>([]);
  const [persona, setPersona] = useState('profil-1');
  const [phases, setPhases] = useState<string[]>([...ALL_PHASES]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Refresh after an action (seed/run). Persona auto-select only happens on the
  // initial mount effect, so this just re-pulls the lists.
  const load = useCallback(async () => {
    const res = await fetch('/api/dev/simulations');
    if (!res.ok) { setMsg(`Load failed (${res.status})`); return; }
    const data = await res.json();
    setRuns(data.runs ?? []);
    setPersonas(data.personas ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/dev/simulations');
      if (cancelled) return;
      if (!res.ok) { setMsg(`Load failed (${res.status})`); return; }
      const data = await res.json();
      if (cancelled) return;
      setRuns(data.runs ?? []);
      setPersonas(data.personas ?? []);
      if (data.personas?.[0]) setPersona(data.personas[0].slug);
    })();
    return () => { cancelled = true; };
  }, []);

  async function seed() {
    setBusy(true); setMsg('Seeding personas…');
    const res = await fetch('/api/dev/simulations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'seed' }),
    });
    const data = await res.json();
    setMsg(res.ok ? `Seeded ${data.seeded} personas.` : `Seed failed: ${data.error}`);
    setBusy(false); load();
  }

  async function run() {
    setBusy(true); setMsg(`Running ${persona} (${phases.join(', ')})… this can take a few minutes.`);
    const res = await fetch('/api/dev/simulations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona, phases }),
    });
    const data = await res.json();
    setMsg(res.ok
      ? `Done — score ${data.result.verdict.score}, ${data.result.failedFindings} failed finding(s).`
      : `Run failed: ${data.error}`);
    setBusy(false); load();
  }

  function togglePhase(p: string) {
    setPhases(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...ALL_PHASES.filter(a => prev.includes(a) || a === p)]);
  }

  return (
    <div className="mx-auto max-w-4xl p-6 text-sm">
      <h1 className="mb-1 text-xl font-semibold">Coaching-Simulationen</h1>
      <p className="mb-4 text-gray-500">
        Synthetische Kunden gegen den echten Coach laufen lassen, automatisch bewerten.
      </p>

      <div className="mb-6 rounded-lg border border-gray-200 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="font-medium">Profil:</label>
          <select
            className="rounded border border-gray-300 px-2 py-1"
            value={persona}
            onChange={e => setPersona(e.target.value)}
          >
            {personas.length === 0 && <option value="profil-1">profil-1</option>}
            {personas.map(p => <option key={p.slug} value={p.slug}>{p.slug} — {p.label}</option>)}
          </select>
          <button onClick={seed} disabled={busy}
            className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-50">
            Profile seeden
          </button>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="font-medium">Phasen:</span>
          {ALL_PHASES.map(p => (
            <label key={p} className="flex items-center gap-1">
              <input type="checkbox" checked={phases.includes(p)} onChange={() => togglePhase(p)} />
              {p}
            </label>
          ))}
        </div>
        <button onClick={run} disabled={busy || phases.length === 0}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
          {busy ? 'Läuft…' : 'Simulation starten'}
        </button>
        {msg && <p className="mt-3 text-gray-600">{msg}</p>}
      </div>

      <h2 className="mb-2 font-semibold">Letzte Läufe</h2>
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {runs.length === 0 && <p className="p-4 text-gray-400">Noch keine Läufe.</p>}
        {runs.map(r => (
          <Link key={r.id} href={`/dev/simulations/${r.id}`}
            className="flex items-center justify-between p-3 hover:bg-gray-50">
            <span>
              <span className="font-medium">{r.persona_slug}</span>
              <span className="ml-2 text-gray-500">{r.phases_run?.join(' → ') || '—'}</span>
            </span>
            <span className="flex items-center gap-3">
              <StatusBadge status={r.status} />
              {r.verdict && (
                <span className={r.verdict.pass ? 'text-green-600' : 'text-red-600'}>
                  {r.verdict.score} {r.verdict.pass ? '✓' : '✗'}
                </span>
              )}
              <span className="text-gray-400">{new Date(r.started_at).toLocaleString()}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'done' ? 'bg-green-100 text-green-700'
    : status === 'failed' ? 'bg-red-100 text-red-700'
    : 'bg-yellow-100 text-yellow-700';
  return <span className={`rounded px-2 py-0.5 text-xs ${color}`}>{status}</span>;
}
