import { section, sectionY } from './landing-styles';

const PROBLEMS = [
  {
    title: 'ChatGPT ja — Automatisierung nein',
    text: 'Im Team wird gechattet, aber wiederkehrende Aufgaben laufen weiter manuell. KI hilft beim Formulieren, nicht beim Ablauf.',
  },
  {
    title: 'Automatisierung ohne Priorität',
    text: 'Du weißt, dass Prozesse automatisierbar wären — aber welche zuerst, mit welchem Tool?',
  },
  {
    title: 'Kein Einstieg, kein Know-how',
    text: 'Du weißt nicht, wo du anfangen sollst — und ohne technischen Hintergrund wirkt jedes Tool wie ein weiteres Baustellen-Projekt.',
  },
];

export default function Problems() {
  return (
    <section className={`${section} ${sectionY}`}>
      <p className="text-center text-sm font-semibold uppercase tracking-wider text-indigo-600 mb-10">
        Kennst du das?
      </p>
      <div className="grid md:grid-cols-3 gap-5">
        {PROBLEMS.map((item, i) => (
          <div
            key={item.title}
            className="group rounded-2xl border border-gray-200 bg-white p-8 shadow-sm hover:shadow-md hover:border-indigo-200/60 transition-all"
          >
            <span className="text-4xl font-bold text-gray-100 group-hover:text-indigo-100 transition-colors">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3 className="mt-4 text-xl font-bold text-gray-900">{item.title}</h3>
            <p className="mt-3 text-gray-600 leading-relaxed">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
