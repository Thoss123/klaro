"use client"

import React, { useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { isExistingAccountOnSignup } from '@/lib/auth-signup';
import type { SupabaseClient } from '@supabase/supabase-js';
import Lottie from 'lottie-react';
import successAnimation from '@/public/success.json';
import { motion, AnimatePresence } from 'framer-motion';

export default function AuthForm({
  onSuccess,
  onExistingAccount,
  defaultMode = 'signup',
}: {
  onSuccess: () => void
  onExistingAccount?: (details: { email: string; password: string }) => void
  defaultMode?: 'login' | 'signup'
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [mode, setMode] = useState<'login' | 'signup' | 'verify'>(defaultMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabaseRef = useRef<SupabaseClient | null>(null);
  const getSupabase = () => {
    if (!supabaseRef.current) {
      supabaseRef.current = createSupabaseBrowserClient();
    }
    return supabaseRef.current;
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabase();
      if (mode === 'signup') {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/api/auth/callback`,
          },
        });
        if (isExistingAccountOnSignup(signUpData, signUpError)) {
          onExistingAccount?.({ email, password });
          return;
        }
        if (signUpError) throw signUpError;

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          onSuccess();
        } else {
          setMode('verify');
        }
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        onSuccess();
      } else if (mode === 'verify') {
        const { error } = await supabase.auth.verifyOtp({
           email,
           token,
           type: 'signup'
        });
        if (error) throw error;
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Ein Fehler ist aufgetreten');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback`,
        }
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Ein Fehler ist aufgetreten');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto p-6 bg-white border border-gray-200 rounded-3xl shadow-xl overflow-hidden relative">
      <AnimatePresence mode="wait">
        {mode === 'verify' ? (
          <motion.div 
            key="verify"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col items-center text-center"
          >
            <div className="w-48 h-48 mb-2">
              <Lottie animationData={successAnimation} loop={false} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">E-Mail checken!</h2>
            <p className="text-gray-500 text-sm mb-6">
              Wir haben dir einen Bestätigungslink und einen Code an <strong>{email}</strong> geschickt.
            </p>
            
            {error && (
              <div className="mb-4 w-full p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                {error}
              </div>
            )}

            <form onSubmit={handleAuth} className="w-full flex flex-col gap-4">
              <div>
                <input
                  type="text"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  required
                  className="w-full px-4 py-3 text-center tracking-widest text-lg font-mono border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="000000"
                  maxLength={6}
                />
              </div>
              <button
                type="submit"
                disabled={loading || token.length < 6}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50"
              >
                {loading ? 'Prüfe...' : 'Bestätigen'}
              </button>
            </form>
          </motion.div>
        ) : (
          <motion.div 
            key="auth"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex flex-col"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
              {mode === 'signup' ? 'Account erstellen' : 'Anmelden'}
            </h2>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleAuth}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold py-2.5 rounded-xl transition-all disabled:opacity-50 mb-6"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Mit Google weiter
            </button>

            <div className="relative flex items-center justify-center mb-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
              <div className="relative bg-white px-4 text-xs text-gray-400 uppercase font-bold tracking-wider">Oder</div>
            </div>

            <form onSubmit={handleAuth} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="deine@email.de"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition-all disabled:opacity-50"
              >
                {loading ? 'Lädt...' : (mode === 'signup' ? 'Registrieren' : 'Einloggen')}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-gray-500">
              {mode === 'signup' ? (
                <>
                  Bereits einen Account?{' '}
                  <button onClick={() => setMode('login')} className="text-indigo-600 font-semibold hover:underline">
                    Hier anmelden
                  </button>
                </>
              ) : (
                <>
                  Noch keinen Account?{' '}
                  <button onClick={() => setMode('signup')} className="text-indigo-600 font-semibold hover:underline">
                    Hier registrieren
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
