import React from 'react';
import { Play } from 'lucide-react';

export default function Video() {
  return (
    <section className="max-w-4xl mx-auto px-6 py-16 sm:py-24 text-center">
      <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
        Sieh wie Klaro arbeitet.
      </h2>

      <div
        id="pitch-video"
        className="mt-10 relative aspect-video w-full rounded-2xl overflow-hidden border border-gray-200 bg-gray-900 group cursor-pointer"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-white/95 shadow-lg transition-transform group-hover:scale-105">
            <Play size={30} className="text-indigo-600 ml-1" fill="currentColor" />
          </span>
        </div>
      </div>

      <p className="mt-6 text-gray-500 text-base sm:text-lg">
        Von der ersten Frage zum fertigen Implementierungsplan — in einem
        Gespräch.
      </p>
    </section>
  );
}
