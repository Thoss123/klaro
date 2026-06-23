import { Briefcase, Wrench, Users } from 'lucide-react';
import { section, sectionY, h2, lead } from './landing-styles';

const PERSONAS = [
  {
    icon: Briefcase,
    title: 'Inhaber & Geschäftsführung',
    text: 'Für alle, die KI pragmatisch im Betrieb nutzen wollen — ohne sich durch Tool-Landschaften zu kämpfen. Axantilo liefert den Plan und die erste laufende Automatisierung.',
  },
  {
    icon: Wrench,
    title: 'IT & Umsetzung',
    text: 'Für interne Umsetzer, die ein klares Briefing und fertige Workflows wollen — statt vager „KI-Ideen“.',
  },
  {
    icon: Users,
    title: 'Agentur & Beratung',
    text: 'Für Dienstleister, die Kunden von der Diagnose bis zur Automatisierung begleiten.',
  },
];

export default function ForWho() {
  return (
    <section className={`${section} ${sectionY} bg-slate-50 border-y border-gray-200/80`}>
      <h2 className={h2}>Für wen ist Axantilo gemacht?</h2>
      <p className={lead}>
        Vor allem für KMU-Inhaber, die vom Gespräch bis zur Automatisierung kommen wollen.
      </p>

      <div className="mt-14 grid md:grid-cols-3 gap-5">
        {PERSONAS.map(({ icon: Icon, title, text }, i) => (
          <div
            key={title}
            className={`rounded-2xl border bg-white p-8 shadow-sm hover:shadow-md transition-shadow ${
              i === 0
                ? 'border-indigo-200 ring-2 ring-indigo-100 md:row-span-1'
                : 'border-gray-200'
            }`}
          >
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-600 text-white mb-5 shadow-lg shadow-indigo-500/20">
              <Icon size={24} />
            </span>
            <h3 className="text-xl font-bold text-gray-900">{title}</h3>
            <p className="mt-3 text-gray-600 leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
