import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function FinalCTA() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
      <div className="bg-white border border-gray-200 rounded-3xl shadow-sm px-6 py-16 sm:py-20 text-center">
        <h2 className="text-3xl sm:text-5xl font-bold text-gray-900 tracking-tight leading-tight">
          Fang heute an.
          <br />
          Es dauert 5 Minuten.
        </h2>
        <Link
          href="/onboarding"
          className="mt-8 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base px-7 py-4 rounded-xl transition-colors"
        >
          Jetzt kostenlos starten <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}
