import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-2 text-sm font-medium mb-8"
        >
          <ArrowLeft size={16} /> Zurück zur Startseite
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-10">Impressum</h1>

        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Angaben gemäß § 5 E-Commerce-Gesetz (ECG)
          </h2>
          <p className="text-gray-800 leading-relaxed">
            Thomas Hruby<br />
            Albersdorf 244<br />
            8200 Gleisdorf<br />
            Österreich
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Kontakt
          </h2>
          <p className="text-gray-800 leading-relaxed">
            Telefon: <a href="tel:+436776285368" className="hover:text-gray-900 underline">+43 677 62853686</a><br />
            E-Mail: <a href="mailto:hello@axantilo.com" className="hover:text-gray-900 underline">hello@axantilo.com</a>
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Unternehmensgegenstand
          </h2>
          <p className="text-gray-800 leading-relaxed">
            Softwareentwicklung, KI-Automatisierung und Online-Marketing
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Behörde
          </h2>
          <p className="text-gray-800 leading-relaxed">
            Bezirkshauptmannschaft Weiz
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Umsatzsteuer
          </h2>
          <p className="text-gray-800 leading-relaxed">
            Kleinunternehmer gemäß § 6 Abs. 1 Z 27 UStG — umsatzsteuerbefreit, keine UID-Nummer.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            EU-Streitschlichtung
          </h2>
          <p className="text-gray-800 leading-relaxed">
            Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
            <a
              href="https://ec.europa.eu/consumers/odr"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-900"
            >
              https://ec.europa.eu/consumers/odr
            </a>
            . Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer
            Verbraucherschlichtungsstelle teilzunehmen.
          </p>
        </section>

        <p className="text-xs text-gray-400 mt-12">Stand: Juni 2026</p>
      </div>
    </div>
  );
}
