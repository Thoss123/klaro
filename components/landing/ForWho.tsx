import { Briefcase, Wrench, Users } from 'lucide-react';
import { section, sectionY, h2, lead } from './landing-styles';

const PERSONAS = [
  {
    icon: Briefcase,
    title: 'Geschäftsführung',
    text: 'KI ist wichtig — aber keine Zeit für Tool-Chaos. Axantilo liefert Plan und optional die erste laufende Automatisierung.',
  },
  {
    icon: Wrench,
    title: 'IT & Umsetzung',
    text: 'Klares Briefing und konkrete Schritte — statt „mach mal was mit KI“.',
  },
  {
    icon: Users,
    title: 'Agentur & Beratung',
    text: 'Kunden von der Diagnose bis zur Umsetzung führen — mit nachvollziehbarer Roadmap, nicht nur Slides.',
  },
];

export default function ForWho() {
  return (
    <section className={`${section} ${sectionY} bg-slate-50 border-y border-gray-200/80`}>
      <h2 className={h2}>Für wen ist Axantilo?</h2>
      <p className={lead}>KMU und Teams, die vom Gespräch bis zur Automatisierung kommen wollen.</p>

      <div className="mt-14 grid md:grid-cols-3 gap-5">
        {PERSONAS.map(({ icon: Icon, title, text }) => (
          <div
            key={title}
            className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm hover:shadow-md transition-shadow"
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
