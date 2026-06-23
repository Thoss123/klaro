import { Search, BarChart3, Map, Rocket, MessageSquare, Play } from 'lucide-react';
import { section, sectionY, h2, lead } from './landing-styles';

/** Chat session labels + Roadmap checkpoint subtitles (RoadmapCanvas PhaseNode) */
const PHASES = [
  {
    title: '1. Diagnose',
    subtitle: 'Problem Identifikation',
    icon: Search,
    desc: 'Pain Points und Unternehmensprofil — der Coach fragt gezielt nach Alltag und Engpässen.',
    outputs: ['Pain Points', 'Ist-Zustand'],
    iconClass: 'bg-sky-50 text-sky-600 border-sky-100',
  },
  {
    title: '2. Analyse',
    subtitle: 'Tools & Setup',
    icon: BarChart3,
    desc: 'Ist-Tools und Automatisierungspotenzial — alles aus dem Gespräch.',
    outputs: ['Tool-Stack', 'Use Cases'],
    iconClass: 'bg-violet-50 text-violet-600 border-violet-100',
  },
  {
    title: '3. Plan',
    subtitle: 'Workflows',
    icon: Map,
    desc: 'Automatisierungs-Blaupausen auf der Roadmap — priorisiert, Schritt für Schritt.',
    outputs: ['Abläufe 1–3', 'Erste Schritte'],
    iconClass: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  },
  {
    title: '4. Umsetzung',
    subtitle: 'Go-Live',
    icon: Rocket,
    desc: 'Axantilo baut die Automatisierung, du hinterlegst Zugänge — dann Livegang und Testlauf.',
    outputs: ['Fertiger Ablauf', 'Live'],
    iconClass: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    highlight: true,
  },
];

export default function Phases() {
  return (
    <section className={`${section} ${sectionY} bg-white`} id="phasen">
      <h2 className={h2}>Vier Phasen. Ein durchgängiger Weg.</h2>
      <p className={lead}>
        Nicht nur Chat und Notizen: Axantilo hält Kontext über die gesamte Journey
        und liefert am Ende umsetzbare Automatisierung.
      </p>

      <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PHASES.map((p) => {
          const Icon = p.icon;
          return (
            <div
              key={p.title}
              className={`relative rounded-2xl border bg-white p-5 flex flex-col shadow-sm hover:shadow-md transition-shadow ${
                p.highlight
                  ? 'border-emerald-200 ring-2 ring-emerald-100'
                  : 'border-gray-200'
              }`}
            >
              {p.highlight && (
                <span className="absolute -top-2.5 left-4 text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white px-2 py-0.5 rounded-md">
                  Bis Live-Schalten
                </span>
              )}
              <div className="flex items-center gap-3 mb-3">
                <span
                  className={`grid h-9 w-9 place-items-center rounded-lg border ${p.iconClass}`}
                >
                  <Icon size={18} />
                </span>
                <p className="text-[11px] font-medium text-gray-400 leading-tight">
                  {p.subtitle}
                </p>
              </div>
              <h3 className="text-lg font-bold text-gray-900">{p.title}</h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed flex-1">
                {p.desc}
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {p.outputs.map((o) => (
                  <span
                    key={o}
                    className="text-[11px] font-medium text-gray-700 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-md"
                  >
                    {o}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-12 rounded-2xl border border-gray-200 bg-slate-50 p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10">
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: MessageSquare, label: '1. Diagnose' },
              { icon: BarChart3, label: '2. Analyse' },
              { icon: Map, label: '3. Plan' },
              { icon: Play, label: '4. Umsetzung' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center text-center gap-2">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-white border border-gray-200 text-indigo-600 shadow-sm">
                  <Icon size={22} />
                </span>
                <span className="text-xs font-semibold text-gray-700">{label}</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-600 leading-relaxed lg:max-w-md">
            Gespräch und Roadmap laufen parallel — Axantilo übernimmt Fakten aus dem
            Dialog. In Phase 4 wird aus dem Plan die fertige Automatisierung;
            du gibst nur noch Zugänge, Texte und Freigabe-Kanäle ein.
          </p>
        </div>
      </div>
    </section>
  );
}
