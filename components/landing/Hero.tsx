"use client"

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bot, ArrowUp } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function Hero() {
  const router = useRouter();
  const [intro, setIntro] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
  }, []);

  const startConversation = () => {
    const text = intro.trim();
    if (text) {
      localStorage.setItem('klaro_intro_message', text);
    }
    router.push('/onboarding');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startConversation();
  };

  return (
    <div className="relative">
      {/* Nav */}
      <nav className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white font-bold tracking-tight text-lg">
            K
          </span>
          <span className="font-bold text-gray-900 text-lg">Klaro</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {isLoggedIn ? (
            <Link
              href="/chat"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-gray-600 hover:text-gray-900 font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-gray-100 transition-colors"
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

      {/* Hero split */}
      <div className="max-w-6xl mx-auto px-6 pt-12 pb-20 sm:pt-20 sm:pb-28 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* Left */}
        <div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-[1.05] tracking-tight">
            KI einsetzen.
            <br />
            Aber wo anfangen?
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-500 leading-relaxed max-w-md">
            Klaro stellt dir die richtigen Fragen — und baut daraus deinen
            persönlichen Implementierungsplan.
          </p>
        </div>

        {/* Right: live chat interface element */}
        <div className="bg-white border border-gray-200 rounded-3xl shadow-xl p-5 sm:p-6">
          <div className="flex items-center gap-3 pb-4 mb-4 border-b border-gray-100">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white font-bold tracking-tight text-sm">
              K
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-800 leading-none">Klaro Coach</p>
              <p className="text-xs text-gray-400 mt-1">Online</p>
            </div>
          </div>

          {/* Coach message */}
          <div className="flex gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Bot size={18} className="text-blue-600" />
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-gray-800 text-sm leading-relaxed">
              Wo merkst du in deinem Alltag, dass Aufgaben zu lange dauern oder
              sich zu oft wiederholen?
            </div>
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-3xl focus-within:border-indigo-400 transition-colors"
          >
            <textarea
              value={intro}
              onChange={(e) => {
                setIntro(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  startConversation();
                }
              }}
              placeholder="Schreib einfach drauf los..."
              rows={1}
              className="flex-1 bg-transparent px-2 py-2 focus:outline-none text-gray-800 text-sm resize-none self-center"
              style={{ minHeight: '36px', maxHeight: '120px' }}
            />
            <button
              type="submit"
              aria-label="Gespräch starten"
              className="w-9 h-9 flex shrink-0 items-center justify-center bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors"
            >
              <ArrowUp size={18} strokeWidth={2.5} />
            </button>
          </form>
          <p className="mt-3 text-xs text-gray-400 text-center">
            Kostenlos · Keine Kreditkarte nötig
          </p>
        </div>
      </div>
    </div>
  );
}
