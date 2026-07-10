"use client"

import React, { useEffect, useRef } from 'react';
import AuthForm from '@/components/auth/AuthForm';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { loadProjects } from '@/lib/supabase-chat';
import type { BerndConfig } from '@/lib/bernd/types';

/**
 * Bernd-eigene Login-Seite (statt der generischen /login, die immer zu den
 * alten Axantilo-Pfaden /dashboard bzw. /onboarding routet). Findet nach dem
 * Login das erste Projekt mit einer bernd_configs-Zeile — gleiches Muster wie
 * app/bernd/dashboard/page.tsx — und schickt Nutzer:innen ins Bernd-Dashboard
 * bzw. bei fehlender Config ins Bernd-Onboarding.
 */
export default function BerndLoginPage() {
  const router = useRouter();

  // Nach Passwort-Login/Signup (AuthForm onSuccess) UND nach Rückkehr aus dem
  // Google-OAuth-Redirect (voller Seiten-Reload, siehe useEffect unten): erstes
  // Projekt mit vorhandener Bernd-Config suchen und passend weiterleiten.
  const routeAfterAuth = async () => {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const projects = await loadProjects();
      let foundConfig: BerndConfig | null = null;
      for (const project of projects) {
        const { data } = await supabase
          .from('bernd_configs')
          .select('*')
          .eq('project_id', project.id)
          .maybeSingle();
        if (data) {
          foundConfig = data as BerndConfig;
          break;
        }
      }

      router.push(foundConfig ? '/bernd/dashboard' : '/bernd/onboarding');
    } catch {
      router.push('/bernd/onboarding');
    }
  };

  // Deckt die Rückkehr aus dem Google-OAuth-Redirect ab: das ist ein voller
  // Seiten-Reload, AuthForms onSuccess-Callback läuft dabei nicht. Ohne Session
  // beim Mount bleibt einfach das Formular stehen (kein Redirect, kein Fehler).
  const didCheck = useRef(false);
  useEffect(() => {
    if (didCheck.current) return;
    didCheck.current = true;
    routeAfterAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 bg-grid">
      <div className="w-full max-w-sm mb-6 flex justify-between items-center">
        <Link href="/bernd" className="text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-2 text-sm font-medium">
          <ArrowLeft size={16} /> Zurück zu Bernd
        </Link>
      </div>
      <AuthForm onSuccess={routeAfterAuth} defaultMode="login" oauthRedirectTo="/bernd/login" />
    </div>
  );
}
