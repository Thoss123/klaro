import { Sparkles, Bot, Zap } from 'lucide-react';
import { section, sectionY, h2, lead } from './landing-styles';
import LandingWorkflowEditor from './LandingWorkflowEditor';

const STRATEGY = [
  {
    rank: 1,
    title: 'Angebote mit KI vorbereiten',
    description:
      'KI zieht Kundendaten, schreibt den Entwurf — du prüfst kurz und gibst frei. Kein Neuschreiben von Null.',
    aiRole: 'Entwurf & Struktur',
    badge: 'Erstes Ziel',
    badgeClass: 'text-indigo-700 bg-indigo-50 border-indigo-100',
    icon: Sparkles,
  },
  {
    rank: 2,
    title: 'E-Mails sortieren & vorfiltrieren',
    description:
      'KI erkennt Wichtiges und Routine — du siehst nur, was wirklich deine Entscheidung braucht.',
    aiRole: 'Priorisierung',
    badge: 'Hoher Hebel',
    badgeClass: 'text-violet-700 bg-violet-50 border-violet-100',
    icon: Bot,
  },
  {
    rank: 3,
    title: 'Gesprächsnotizen festhalten',
    description:
      'KI strukturiert Notizen aus Meetings — Wissen landet automatisch, nicht nur im Kopf.',
    aiRole: 'Wissen sichern',
    badge: 'Als Nächstes',
    badgeClass: 'text-sky-700 bg-sky-50 border-sky-100',
    icon: Zap,
  },
];

const LIVE_STEPS = [
  'Axantilo baut den Ablauf — du prüfst die Schritte im Editor',
  'Du verbindest eure Tools und startest einen Testlauf',
  'Danach läuft die Automatisierung bei euch — nicht nur auf dem Papier',
];

export default function Result() {
  return (
    <section className={`${section} ${sectionY} bg-white`}>
      <h2 className={h2}>KI-Strategie und Automatisierungen — aus eurem Gespräch.</h2>
      <p className={lead}>
        Axantilo sortiert, wo KI bei euch den meisten Hebel hat, plant die Abläufe mit dir
        — und setzt sie anschließend bei euch um.
      </p>

      <div className="mt-14 rounded-3xl border border-gray-200 bg-slate-50 p-6 sm:p-10 shadow-sm">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
              KI-Strategie · Was zuerst
            </p>
            <div className="space-y-3">
              {STRATEGY.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm"
                  >
                    <div className="flex gap-3 sm:gap-4">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                        <Icon size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-mono text-gray-400 shrink-0">
                              #{item.rank}
                            </span>
                            <h3 className="text-sm font-semibold text-gray-900 leading-snug">
                              {item.title}
                            </h3>
                          </div>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${item.badgeClass}`}
                          >
                            {item.badge}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed">{item.description}</p>
                        <p className="mt-2 text-[10px] font-medium text-indigo-600">
                          KI-Rolle: {item.aiRole}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
              Automatisierung · Bei dir live
            </p>
            <LandingWorkflowEditor />
            <ol className="mt-5 space-y-2.5">
              {LIVE_STEPS.map((line, i) => (
                <li key={line} className="flex items-start gap-3 text-sm text-gray-700">
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
