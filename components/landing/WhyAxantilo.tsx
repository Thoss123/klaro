import { Workflow, MousePointerClick, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { section, sectionY, h2, lead } from './landing-styles';

const USPS = [
  {
    icon: Workflow,
    title: 'Kein Berater-Marathon',
    text: 'Gespräch, Plan und erste Automatisierung laufen in einem geführten Flow — direkt im Tool.',
  },
  {
    icon: MousePointerClick,
    title: 'Ohne Technik-Hürde',
    text: 'Keine Skripte, kein Prompt-Basteln. Axantilo führt dich durch Fragen und übernimmt den Technik-Teil.',
  },
  {
    icon: ShieldCheck,
    title: 'DSGVO & EU-Hosting',
    text: 'Entwickelt in Österreich, Daten in der EU, auf Basis von Mistral AI — keine versteckten US-Cloud-Dienste.',
  },
  {
    icon: CheckCircle2,
    title: 'Von „Wir sollten“ zu „Es läuft“',
    text: 'Am Ende steht ein fertiger Ablauf, der bei dir arbeitet — kein PDF mit Ideen.',
  },
];

export default function WhyAxantilo() {
  return (
    <section className={`${section} ${sectionY} bg-white`}>
      <h2 className={h2}>Warum Axantilo?</h2>
      <p className={lead}>
        Kein weiteres KI-Tool zum Ausprobieren — ein Weg, der wirklich bei der
        laufenden Automatisierung endet.
      </p>

      <div className="mt-14 grid sm:grid-cols-2 gap-5">
        {USPS.map(({ icon: Icon, title, text }) => (
          <div
            key={title}
            className="flex gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
              <Icon size={22} />
            </span>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{title}</h3>
              <p className="mt-1.5 text-gray-600 leading-relaxed">{text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
