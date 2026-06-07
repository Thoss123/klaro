'use client';

import Link from 'next/link';
import LandingNav from './LandingNav';
import ProductShowcase from './ProductShowcase';
import ScrollAnchorLink from './ScrollAnchorLink';

export default function Hero() {
  return (
    <div className="relative overflow-hidden bg-slate-50 bg-grid">
      <div className="relative z-10">
        <LandingNav variant="light" />

        <header className="max-w-6xl mx-auto px-6 pt-12 pb-20 sm:pt-20 sm:pb-28 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-[1.05] tracking-tight">
            KI einsetzen.
            <br />
            Workflows bauen & umsetzen.
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-500 leading-relaxed max-w-md">
            Klaro stellt die richtigen Fragen, füllt deinen Plan live — und baut
            daraus Automatisierungen, die du wirklich umsetzen kannst.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link
              href="/onboarding"
              className="inline-flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-base px-6 py-3.5 rounded-xl transition-colors"
            >
              Kostenlos starten
            </Link>
            <ScrollAnchorLink
              href="#so-arbeitet-klaro"
              className="inline-flex items-center justify-center text-gray-600 hover:text-gray-900 font-semibold text-base px-6 py-3.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
            >
              So arbeitet Klaro
            </ScrollAnchorLink>
            </div>
          </div>

          <ProductShowcase />
        </header>
      </div>
    </div>
  );
}
