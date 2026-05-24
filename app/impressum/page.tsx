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
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Impressum</h1>
        <p className="text-gray-500">Inhalt folgt.</p>
      </div>
    </div>
  );
}
