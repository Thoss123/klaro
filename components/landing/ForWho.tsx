import React from 'react';
import { Briefcase, Wrench, Users } from 'lucide-react';

const PERSONAS = [
  {
    icon: Briefcase,
    title: 'Geschäftsführer',
    text: 'Für den der weiß dass KI wichtig ist — aber keine Zeit hat sich einzuarbeiten.',
  },
  {
    icon: Wrench,
    title: 'IT / Umsetzer',
    text: 'Für die IT-Person die ein klares Briefing braucht bevor sie loslegt.',
  },
  {
    icon: Users,
    title: 'Agentur',
    text: 'Für die Agentur die ihren Kunden zeigen will wo KI wirklich hilft.',
  },
];

export default function ForWho() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-16 sm:py-24">
      <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight text-center mb-16">
        Für wen ist Klaro?
      </h2>

      <div className="grid md:grid-cols-3 gap-5">
        {PERSONAS.map(({ icon: Icon, title, text }) => (
          <div
            key={title}
            className="bg-white border border-gray-200 rounded-2xl p-7"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600 mb-5">
              <Icon size={22} />
            </span>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
            <p className="text-gray-500 leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
