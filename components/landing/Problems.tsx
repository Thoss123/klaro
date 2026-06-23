import { h2, section, sectionY } from './landing-styles';

const PROBLEMS = [
  {
    title:
      'Du nutzt ChatGPT im Team — aber Angebote, Mails und Follow-ups laufen bei euch trotzdem weiter von Hand.',
    text: 'KI hilft beim Formulieren, nicht beim Ablauf. Was du im Chat löst, bleibt im Alltag eine wiederkehrende Aufgabe.',
  },
  {
    title:
      'Du weißt, dass automatisieren sinnvoll wäre — aber nicht, welchen Prozess du zuerst angehen sollst.',
    text: 'Zu viele Tools, zu wenig Priorität: Welcher Engpass bringt am meisten, und lohnt sich der Aufwand überhaupt?',
  },
  {
    title:
      'Du willst loslegen — aber ohne technischen Hintergrund wirkt jedes Automatisierungs-Tool wie ein Baustellen-Projekt.',
    text: 'Integrationen, Zugänge, Konfiguration: Ohne klare Anleitung bleibst du bei der Idee stehen, statt sie umzusetzen.',
  },
];

export default function Problems() {
  return (
    <section className={`${section} ${sectionY}`}>
      <h2 className={`${h2} mb-12 sm:mb-14`}>Kennst du das?</h2>
      <div className="flex flex-col gap-4 max-w-3xl mx-auto">
        {PROBLEMS.map((item, i) => (
          <div
            key={item.title}
            className="group rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm hover:shadow-md hover:border-indigo-200/60 transition-all"
          >
            <div className="flex gap-5 sm:gap-6">
              <span className="text-3xl sm:text-4xl font-bold text-gray-100 group-hover:text-indigo-100 transition-colors shrink-0 leading-none pt-0.5">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 leading-snug">
                  {item.title}
                </h3>
                <p className="mt-3 text-gray-600 leading-relaxed">{item.text}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
