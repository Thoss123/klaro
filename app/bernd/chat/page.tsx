"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HardHat, ArrowRight, ChevronDown, ChevronUp, IdCard } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { loadProjects } from '@/lib/supabase-chat';
import { SetupChat } from '@/components/bernd/SetupChat';
import { ProfilCanvas } from '@/components/bernd/ProfilCanvas';
import type { BerndConfig, BerndSetupState } from '@/lib/bernd/types';

/**
 * Setup-Chat-Seite (v2-Onboarding, Architekturplan §WP3 Aufgabe 3): 70/30-Layout — links
 * das Einstellungsgespräch mit Bernd (`SetupChat`), rechts das lebende Profil (`ProfilCanvas`)
 * mit der „Bereit zum Start"-Checkliste. Ersetzt den alten Welcome-Chat-Modus
 * (PairingCard + AenderungsChat mode="welcome") — Telegram-Verbindung läuft jetzt inline im
 * Chat über `<getcredential tool="telegram"/>`.
 *
 * Auflösung wie im Dashboard: erstes Projekt mit `bernd_configs`; fehlt eine Config ganz,
 * geht es zurück ins Onboarding (dann wurde noch nicht provisioniert).
 */

interface Connections {
  email: boolean;
  telegram: boolean;
}

export default function BerndChatPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [config, setConfig] = useState<BerndConfig | null>(null);
  const [connections, setConnections] = useState<Connections>({ email: false, telegram: false });
  const [canvasOpen, setCanvasOpen] = useState(false);

  const loadConnections = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`/api/bernd/connections?projectId=${encodeURIComponent(pid)}`);
      if (!res.ok) return;
      const data = (await res.json()) as Connections;
      setConnections({ email: Boolean(data.email), telegram: Boolean(data.telegram) });
    } catch {
      // Verbindungsstatus ist rein additiv fürs Gate — ein fehlgeschlagenes Nachladen blockiert
      // den Chat nicht, das Gate bleibt einfach konservativ (nicht verbunden) bis zum nächsten Poll.
    }
  }, []);

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
        let foundConfig: BerndConfig | null = null;
        for (const project of projects) {
          const { data } = await supabase
            .from('bernd_configs')
            .select('*')
            .eq('project_id', project.id)
            .maybeSingle();
          if (data) {
            foundProjectId = project.id;
            foundConfig = data as BerndConfig;
            break;
          }
        }
        if (!foundProjectId || !foundConfig) {
          router.push('/bernd/onboarding');
          return;
        }
        setProjectId(foundProjectId);
        setConfig(foundConfig);
        await loadConnections(foundProjectId);
      } catch (err) {
        console.error('Bernd-Chat init fehlgeschlagen', err);
        router.push('/bernd/onboarding');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [router, loadConnections]);

  // Bereits aktiv? Dann gehört der Nutzer ins Dashboard, nicht zurück ins Setup-Gespräch.
  useEffect(() => {
    if (config?.status === 'active') {
      router.push('/bernd/dashboard');
    }
  }, [config?.status, router]);

  const handleStateChange = useCallback((state: BerndSetupState) => {
    setConfig((prev) => (prev ? { ...prev, setup_state: state } : prev));
  }, []);

  const handleConnectionChange = useCallback((tool: 'email' | 'telegram') => {
    setConnections((prev) => ({ ...prev, [tool]: true }));
  }, []);

  const handleDeployed = useCallback(() => {
    router.push('/bernd/dashboard');
  }, [router]);

  if (loading || !projectId || !config) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-slate-400">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
          <HardHat size={22} className="animate-pulse text-indigo-500" />
        </div>
        <p className="text-sm">Bernd wird vorbereitet…</p>
      </div>
    );
  }

  const setupState = config.setup_state ?? {};

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100/60 font-sans">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6">
        {/* Kopf */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-lg shadow-indigo-600/25">
              <HardHat size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Bernd wird eingerichtet</h1>
              <p className="text-sm text-slate-500">Erzähl ihm von deinem Betrieb — er richtet sich live ein.</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/bernd/dashboard')}
            className="hidden shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-700 sm:inline-flex"
          >
            Zum Dashboard <ArrowRight size={15} />
          </button>
        </div>

        {/* Mobil: Profil-Canvas als einklappbare Sektion über dem Chat */}
        <div className="mb-4 lg:hidden">
          <button
            type="button"
            onClick={() => setCanvasOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200/70 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm"
          >
            <span className="flex items-center gap-2">
              <IdCard size={16} className="text-indigo-600" /> Bernds Profil
            </span>
            {canvasOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {canvasOpen && (
            <div className="mt-3">
              <ProfilCanvas
                state={setupState}
                emailConnected={connections.email}
                telegramConnected={connections.telegram}
              />
            </div>
          )}
        </div>

        {/* 70/30-Layout ab lg: Chat links, Profil rechts */}
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr] lg:items-start">
          <SetupChat
            projectId={projectId}
            initialState={setupState}
            emailConnected={connections.email}
            telegramConnected={connections.telegram}
            onStateChange={handleStateChange}
            onConnectionChange={handleConnectionChange}
            onDeployed={handleDeployed}
          />

          <div className="hidden lg:block">
            <ProfilCanvas
              state={setupState}
              emailConnected={connections.email}
              telegramConnected={connections.telegram}
            />
          </div>
        </div>

        {/* Weiter-zum-Dashboard (mobil unten, immer erreichbar) */}
        <button
          onClick={() => router.push('/bernd/dashboard')}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 transition-all active:scale-[0.99] sm:hidden"
        >
          Zum Dashboard <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
