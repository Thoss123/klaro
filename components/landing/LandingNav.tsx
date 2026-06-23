'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

type Variant = 'light' | 'dark';

export default function LandingNav({ variant = 'light' }: { variant?: Variant }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const dark = variant === 'dark';

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
  }, []);

  return (
    <nav className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between relative z-20">
      <Link href="/" className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white font-bold tracking-tight text-lg">
          K
        </span>
        <span className={`font-bold text-lg ${dark ? 'text-white' : 'text-gray-900'}`}>
          Axantilo
        </span>
      </Link>
      <div className="flex items-center gap-2 sm:gap-3">
        {isLoggedIn ? (
          <Link
            href="/chat"
            className="bg-white text-slate-900 font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-indigo-50 transition-colors"
          >
            Zum Coach
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className={`font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors ${
                dark
                  ? 'text-slate-300 hover:text-white hover:bg-white/10'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Anmelden
            </Link>
            <Link
              href="/onboarding"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
            >
              Kostenlos starten
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
