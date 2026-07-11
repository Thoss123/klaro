"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HardHat, ArrowRight } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { loadProjects } from '@/lib/supabase-chat';
import { AenderungsChat } from '@/components/bernd/AenderungsChat';
import { PairingCard } from '@/components/bernd/PairingCard';
import type { BerndConfig } from '@/lib/bernd/types';

/**
 * Erstgespräch nach dem Onboarding (Bernd „lernt sich kennen" / erklärt sich / schließt die
 * Einrichtung ab) — DAS ist der erste Anlaufpunkt direkt nach dem Wizard, nicht das Dashboard.
 * Erst nach diesem Chat geht es (per „Weiter zum Dashboard") in den Dauerbetrieb.
 *
 * Auflösung wie im Dashboard: erstes Projekt mit `bernd_configs`; fehlt eine Config ganz,
 * geht es zurück ins Onboarding (dann wurde noch nicht provisioniert).
 */
export default function BerndChatPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [gewerk, setGewerk] = useState<string | null>(null);

  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const init = async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push('/bernd/login');
        return;
      }
      try {
        const projects = await loadProjects();
        if (projects.length === 0) {
          router.push('/bernd/onboarding');
          return;
        }
        let foundProjectId: string | null = null;
        let foundGewerk: string | null = null;
        for (const project of projects) {
          const { data } = await supabase
            .from('bernd_configs')
            .select('project_id, gewerk')
            .eq('project_id', project.id)
            .maybeSingle();
          if (data) {
            foundProjectId = (data as Pick<BerndConfig, 'project_id'>).project_id;
            foundGewerk = (data as Pick<BerndConfig, 'gewerk'>).gewerk;
            break;
          }
        }
        if (!foundProjectId) {
          router.push('/bernd/onboarding');
          return;
        }
        setProjectId(foundProjectId);
        setGewerk(foundGewerk);
      } catch (err) {
        console.error('Bernd-Chat init fehlgeschlagen', err);
        router.push('/bernd/onboarding');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [router]);

  if (loading || !projectId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-slate-400">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
          <HardHat size={22} className="animate-pulse text-indigo-500" />
        </div>
        <p className="text-sm">Bernd wird vorbereitet…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100/60 font-sans">
      <div className="mx-auto max-w-2xl px-5 py-8 sm:px-6">
        {/* Kopf: Bernd + Weiter-zum-Dashboard */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-lg shadow-indigo-600/25">
              <HardHat size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Bernd ist startklar</h1>
              <p className="text-sm text-slate-500">
                Lern ihn kurz kennen{gewerk ? ' und schließ die Einrichtung ab' : ''}.
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/bernd/dashboard')}
            className="hidden shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-700 sm:inline-flex"
          >
            Zum Dashboard <ArrowRight size={15} />
          </button>
        </div>

        {/* Telegram zuerst — der wichtigste Einrichtungsschritt */}
        <div className="mb-5">
          <PairingCard projectId={projectId} />
        </div>

        {/* Erstgespräch (Bernd begrüßt von selbst) */}
        <AenderungsChat
          projectId={projectId}
          mode="welcome"
          kickoff
          title="Willkommen — ich bin Bernd"
          subtitle="Dein neuer digitaler Mitarbeiter"
        />

        {/* Weiter-zum-Dashboard (mobil unten, immer erreichbar) */}
        <button
          onClick={() => router.push('/bernd/dashboard')}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25 transition-all hover:from-indigo-500 hover:to-indigo-700 active:scale-[0.99] sm:hidden"
        >
          Weiter zum Dashboard <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
