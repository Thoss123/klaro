import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { section } from './landing-styles';

export default function MidCTA() {
  return (
    <section className={`${section} pb-4`}>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-5 rounded-2xl border border-indigo-100 bg-indigo-50/50 px-6 py-7 sm:px-8">
        <p className="text-center sm:text-left text-base sm:text-lg font-semibold text-gray-900">
          Vom ersten Gespräch zur ersten Automatisierung — kostenlos ausprobieren.
        </p>
        <Link
          href="/onboarding"
          className="inline-flex shrink-0 items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-base px-6 py-3 rounded-xl transition-colors shadow-sm"
        >
          Kostenlos starten
          <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}
