import Link from 'next/link';
import { ArrowRight, Sparkles, Clock, CreditCard } from 'lucide-react';
import { section } from './landing-styles';

const STEPS = ['Diagnose', 'Analyse', 'Plan', 'Umsetzung'] as const;

export default function FinalCTA() {
  return (
    <section className={`${section} py-20 sm:py-28`}>
      <div className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-slate-50 bg-grid shadow-md">
        <div
          className="absolute inset-0 pointer-events-none bg-indigo-50/40"
          aria-hidden
        />

        <div className="relative z-10 px-6 py-14 sm:py-20 text-center">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 bg-white/90 border border-indigo-100 rounded-full px-4 py-1.5 shadow-sm">
            <Sparkles size={15} className="text-indigo-500" />
            Kostenlos · Keine Kreditkarte
          </p>

          <h2 className="mt-8 text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-[1.1] max-w-3xl mx-auto">
            Fang heute an.
            <br />
            <span className="text-indigo-600">
              An einem Tag zur ersten Automatisierung.
            </span>
          </h2>

          <p className="mt-5 text-gray-600 text-lg max-w-xl mx-auto leading-relaxed">
            Axantilo führt dich Schritt für Schritt — vom Gespräch bis dein erster
            Ablauf bei dir läuft.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {STEPS.map((label, i) => (
              <span key={label} className="inline-flex items-center gap-2">
                <span className="text-xs sm:text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
                  {label}
                </span>
                {i < STEPS.length - 1 && (
                  <ArrowRight size={14} className="text-indigo-300 shrink-0" />
                )}
              </span>
            ))}
          </div>

          <Link
            href="/onboarding"
            className="mt-10 inline-flex items-center gap-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base sm:text-lg px-9 py-4 rounded-xl transition-colors shadow-lg shadow-indigo-600/20"
          >
            Jetzt kostenlos starten
            <ArrowRight size={20} />
          </Link>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <Clock size={15} className="text-indigo-500" />
              Erster Ablauf oft am selben Tag
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CreditCard size={15} className="text-indigo-500" />
              Keine Kreditkarte nötig
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
