import { Zap, Cpu, User, Check } from 'lucide-react';
import { SiGmail as GmailIcon, SiGooglesheets } from 'react-icons/si';
import { section, sectionY, h2, lead } from './landing-styles';

const PAIN_POINTS = [
  {
    title: 'Angebote manuell',
    description: 'Jedes Angebot von Hand — fehleranfällig, 3–4h/Woche.',
    priority: 'Hoch',
  },
  {
    title: 'E-Mail-Flut',
    description: 'Wichtiges geht in Routine-Anfragen unter.',
    priority: 'Hoch',
  },
  {
    title: 'Wissen auf Köpfen',
    description: 'Bei Ausfall fehlt Zugriff auf Know-how.',
    priority: 'Mittel',
  },
];

const WORKFLOW_STEPS = [
  { type: 'trigger', label: 'Formular', icon: Zap, color: '#f59e0b' },
  { type: 'data', label: 'Sheets', icon: SiGooglesheets, color: '#34A853', brand: true },
  { type: 'ai', label: 'KI-Entwurf', icon: Cpu, color: '#6366f1' },
  { type: 'human', label: 'Freigabe', icon: User, color: '#8b5cf6' },
  { type: 'send', label: 'Gmail', icon: GmailIcon, color: '#EA4335', brand: true },
];

const priorityStyle: Record<string, string> = {
  Hoch: 'text-red-700 bg-red-50 border-red-100',
  Mittel: 'text-amber-700 bg-amber-50 border-amber-100',
};

export default function Result() {
  return (
    <section className={`${section} ${sectionY} bg-white`}>
      <h2 className={h2}>Das kommt raus — nicht nur Folien.</h2>
      <p className={lead}>
        Roadmap mit Prioritäten, konkrete Abläufe und am Ende eine umsetzbare
        Automatisierung — aus dem, was du wirklich gesagt hast.
      </p>

      <div className="mt-14 rounded-3xl border border-gray-200 bg-slate-50 p-6 sm:p-10 shadow-sm">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
              Roadmap · Erkannte Engpässe
            </p>
            <div className="space-y-3">
              {PAIN_POINTS.map((p) => (
                <div
                  key={p.title}
                  className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
                >
                  <div className="flex justify-between gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900">{p.title}</h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${priorityStyle[p.priority]}`}
                    >
                      {p.priority}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{p.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
              Phase 4 · Fertige Automatisierung
            </p>
            <div className="rounded-xl border border-gray-200 bg-slate-50 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                {WORKFLOW_STEPS.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.label} className="flex items-center gap-2">
                      <div
                        className="flex items-center gap-1.5 rounded-lg bg-white border border-gray-200 px-2.5 py-2 shadow-sm"
                        style={{ borderLeftWidth: 3, borderLeftColor: s.color }}
                      >
                        <Icon size={14} style={{ color: s.color }} />
                        <span className="text-[11px] font-medium text-gray-800">
                          {s.label}
                        </span>
                      </div>
                      {i < WORKFLOW_STEPS.length - 1 && (
                        <span className="text-gray-300 text-xs">→</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-200">
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                  <Check size={14} />
                  Bereit zur Umsetzung
                </span>
                <span className="text-[11px] text-gray-400 font-mono">KLARO: Angebots-Flow</span>
              </div>
            </div>
            <ol className="mt-5 space-y-2.5">
              {[
                'Schritte im Chat konfigurieren (Zugang, Freigabe-Kanal)',
                'Automatisierung starten — läuft bei dir',
                'Testlauf mit einem Klick',
              ].map((line, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-600 text-white text-xs font-bold">
                    {i + 1}
                  </span>
                  {line}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
