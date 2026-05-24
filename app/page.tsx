import Link from 'next/link';
import Hero from '@/components/landing/Hero';
import Problems from '@/components/landing/Problems';
import HowItWorks from '@/components/landing/HowItWorks';
import Video from '@/components/landing/Video';
import Result from '@/components/landing/Result';
import ForWho from '@/components/landing/ForWho';
import Trust from '@/components/landing/Trust';
import FinalCTA from '@/components/landing/FinalCTA';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 font-sans text-gray-900 overflow-x-hidden">
      <div className="bg-grid">
        <Hero />
      </div>
      <Problems />
      <HowItWorks />
      <Video />
      <Result />
      <ForWho />
      <Trust />
      <FinalCTA />

      <footer className="border-t border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            Klaro © 2025 — Made in Austria
          </p>
          <div className="flex items-center gap-6">
            <Link
              href="/datenschutz"
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Datenschutz
            </Link>
            <Link
              href="/impressum"
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Impressum
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
