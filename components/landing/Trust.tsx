import React from 'react';
import { MapPin, ShieldCheck, CreditCard } from 'lucide-react';

const POINTS = [
  { icon: MapPin, text: 'Gebaut in Österreich' },
  { icon: ShieldCheck, text: 'DSGVO-konform — Daten bleiben in der EU' },
  { icon: CreditCard, text: 'Keine Kreditkarte. Kein Risiko.' },
];

export default function Trust() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-16 sm:py-20">
      <div className="grid sm:grid-cols-3 gap-6">
        {POINTS.map(({ icon: Icon, text }) => (
          <div
            key={text}
            className="flex items-center gap-3 justify-center text-center"
          >
            <Icon size={20} className="text-indigo-600 shrink-0" />
            <span className="text-sm font-medium text-gray-700">{text}</span>
          </div>
        ))}
      </div>

      {/* TESTIMONIAL_PLACEHOLDER */}
    </section>
  );
}
