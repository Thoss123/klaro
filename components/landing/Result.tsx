import React from 'react';

const PAIN_POINTS = [
  {
    title: 'Angebote manuell erstellen',
    description:
      'Jedes Angebot wird von Hand zusammengestellt — kostet Zeit und ist fehleranfällig.',
    effort: '3–4h/Woche',
    priority: 'Hoch',
  },
  {
    title: 'E-Mails sortieren & beantworten',
    description:
      'Der Posteingang läuft über, Wichtiges geht zwischen Routine-Anfragen unter.',
    effort: '5h/Woche',
    priority: 'Hoch',
  },
  {
    title: 'Wissen ist auf Köpfe verteilt',
    description:
      'Bei Urlaub oder Krankheit fehlt der Zugriff auf wichtiges Know-how.',
    effort: '2h/Woche',
    priority: 'Mittel',
  },
];

const USE_CASES = [
  {
    title: 'KI-gestützte Angebotsvorlagen',
    impact: 'Spart ~3h pro Woche',
  },
  {
    title: 'Automatische E-Mail-Triage',
    impact: 'Schnellere Reaktionszeit',
  },
];

const STEPS = [
  'Angebots-Vorlagen mit KI-Textbausteinen aufsetzen',
  'E-Mail-Posteingang mit Auto-Kategorisierung testen',
  'Internes Wissen in einer durchsuchbaren Basis bündeln',
];

const priorityStyle: Record<string, string> = {
  Hoch: 'text-red-600 bg-red-50',
  Mittel: 'text-amber-600 bg-amber-50',
  Niedrig: 'text-gray-600 bg-gray-100',
};

export default function Result() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-16 sm:py-24">
      <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight text-center mb-12">
        Das kommt raus.
      </h2>

      <div className="bg-slate-50 bg-grid border border-gray-200 rounded-3xl p-5 sm:p-8">
        {/* Pain points */}
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
          Erkannte Pain Points
        </p>
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {PAIN_POINTS.map((p) => (
            <div
              key={p.title}
              className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold text-gray-900 leading-snug">
                  {p.title}
                </h3>
                <span
                  className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${priorityStyle[p.priority]}`}
                >
                  {p.priority}
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-4">
                {p.description}
              </p>
              <span className="text-[11px] font-medium text-gray-600 bg-gray-100 px-2.5 py-1 rounded-md">
                {p.effort}
              </span>
            </div>
          ))}
        </div>

        {/* Use cases */}
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
          Mögliche Use Cases
        </p>
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          {USE_CASES.map((u) => (
            <div
              key={u.title}
              className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex items-center justify-between gap-4"
            >
              <h3 className="text-sm font-semibold text-gray-900">{u.title}</h3>
              <span className="shrink-0 text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full">
                {u.impact}
              </span>
            </div>
          ))}
        </div>

        {/* First steps */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <p className="text-sm font-bold text-gray-900 mb-4">Erste 3 Schritte</p>
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-600 text-white text-xs font-bold">
                  {i + 1}
                </span>
                <span className="text-sm text-gray-700 leading-relaxed pt-0.5">
                  {s}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
