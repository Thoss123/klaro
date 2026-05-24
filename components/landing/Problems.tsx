import React from 'react';

const PROBLEMS = [
  'Du hast ChatGPT ausprobiert — aber drei Wochen später nutzt es niemand mehr.',
  'Du weißt dass Prozesse automatisierbar wären — aber welche zuerst?',
  'Du willst deiner IT ein Briefing geben — aber du weißt nicht was du hineinschreiben sollst.',
];

export default function Problems() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-16 sm:py-24">
      <div className="grid md:grid-cols-3 gap-4 sm:gap-5">
        {PROBLEMS.map((text, i) => (
          <div
            key={i}
            className="border border-gray-200 rounded-2xl p-7 bg-white"
          >
            <span className="text-sm font-mono text-gray-300">
              0{i + 1}
            </span>
            <p className="mt-4 text-lg text-gray-800 leading-snug font-medium">
              {text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
