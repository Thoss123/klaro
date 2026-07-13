"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HardHat, IdCard, X } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { loadProjects } from '@/lib/supabase-chat';
import { SetupChat } from '@/components/bernd/SetupChat';
import { ProfilCanvas } from '@/components/bernd/ProfilCanvas';
import type { BerndConfig, BerndSetupState } from '@/lib/bernd/types';
import { resolveBerndMailProvider } from '@/lib/bernd/mail-provider';

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
  emailProvider?: 'gmail' | 'outlook' | 'imap';
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
      setConnections({
        email: Boolean(data.email),
        telegram: Boolean(data.telegram),
        emailProvider: data.emailProvider,
      });
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
  const resolvedMailProvider = connections.emailProvider ?? resolveBerndMailProvider(config.tools, setupState);
  const emailProvider = resolvedMailProvider === 'outlook' ? 'outlook' : 'gmail';

  return (
    <div className="relative flex h-[100dvh] min-h-0 overflow-hidden bg-white font-sans">
      <main className="flex min-w-0 flex-1 flex-col bg-white xl:max-w-[600px] xl:border-r xl:border-slate-200">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <HardHat size={18} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-slate-900">Bernd einrichten</h1>
              <p className="truncate text-xs text-slate-500">Einstellungsgespräch</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCanvasOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 xl:hidden"
            aria-label="Bernds Profil öffnen"
            title="Bernds Profil"
          >
            <IdCard size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1">
          <SetupChat
            projectId={projectId}
            initialState={setupState}
            emailConnected={connections.email}
            telegramConnected={connections.telegram}
            emailProvider={emailProvider}
            onStateChange={handleStateChange}
            onConnectionChange={handleConnectionChange}
            onDeployed={handleDeployed}
          />
        </div>
      </main>

      <aside className="hidden min-w-0 flex-1 overflow-y-auto bg-slate-50 xl:block">
        <div className="mx-auto max-w-2xl px-8 py-8 2xl:px-12">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase text-slate-400">Live-Profil</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Was Bernd bereits weiß</h2>
          </div>
          <ProfilCanvas
            state={setupState}
            emailConnected={connections.email}
            telegramConnected={connections.telegram}
          />
        </div>
      </aside>

      {canvasOpen && (
        <aside className="absolute inset-0 z-30 flex flex-col bg-slate-50 xl:hidden">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
            <div className="flex items-center gap-2.5">
              <IdCard size={18} className="text-indigo-600" />
              <span className="text-sm font-semibold text-slate-900">Bernds Profil</span>
            </div>
            <button
              type="button"
              onClick={() => setCanvasOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              aria-label="Profil schließen"
            >
              <X size={19} />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <ProfilCanvas
              state={setupState}
              emailConnected={connections.email}
              telegramConnected={connections.telegram}
            />
          </div>
        </aside>
      )}
    </div>
  );
}
