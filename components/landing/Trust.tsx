import { MapPin, ShieldCheck, Plug, UserCheck } from 'lucide-react';
import { section, sectionY } from './landing-styles';

const POINTS = [
  { icon: MapPin, text: 'Entwickelt in Österreich' },
  { icon: ShieldCheck, text: 'DSGVO · Daten in der EU' },
  { icon: Plug, text: 'Deine Tools und Zugänge — nur was du verbindest' },
  { icon: UserCheck, text: 'Bei wichtigen Schritten fragt Axantilo dich — nichts ohne dein Okay' },
];

export default function Trust() {
  return (
    <section className={`${section} ${sectionY}`}>
      <div className="rounded-2xl border border-gray-200 bg-white p-8 sm:p-10">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {POINTS.map(({ icon: Icon, text }) => (
            <div key={text} className="flex flex-col items-center text-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                <Icon size={22} />
              </span>
              <span className="text-sm font-medium text-gray-700 leading-snug">{text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
