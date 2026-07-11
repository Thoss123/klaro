"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, IdCard, BookOpen, MessagesSquare, ListChecks, HardHat } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { loadProjects } from '@/lib/supabase-chat';
import { Steckbrief } from '@/components/bernd/Steckbrief';
import { WissenView } from '@/components/bernd/WissenView';
import { AenderungsChat } from '@/components/bernd/AenderungsChat';
import { LogsWorkflows } from '@/components/bernd/LogsWorkflows';
import { PairingCard } from '@/components/bernd/PairingCard';
import { StatusDot } from '@/components/bernd/ui';
import type { BerndConfig } from '@/lib/bernd/types';

/**
 * Bernd-Dashboard (Architekturplan §5 Screen 3, Login-Startpunkt sobald eine Instanz
 * existiert). Session-Guard wie app/dashboard/page.tsx; ermittelt das erste Projekt mit
 * einer `bernd_configs`-Zeile — ohne Config geht es zurück ins Onboarding.
 *
 * Look: ruhiges Premium-Dashboard — Bernd-Identität im Kopf, segmentierte Tabs mit
 * gleitendem Indikator, weiche Karten. Bewusst schlicht, Usability zuerst.
 */

type TabKey = 'steckbrief' | 'wissen' | 'aendern' | 'logs';

const TABS: { key: TabKey; label: string; icon: typeof IdCard }[] = [
  { key: 'steckbrief', label: 'Steckbrief', icon: IdCard },
  { key: 'wissen', label: 'Wissen', icon: BookOpen },
  { key: 'aendern', label: 'Ändern', icon: MessagesSquare },
  { key: 'logs', label: 'Logs', icon: ListChecks },
];

const STATUS_META: Record<
  BerndConfig['status'],
  { label: string; dot: 'green' | 'amber' | 'slate'; pulse: boolean }
> = {
  active: { label: 'Aktiv', dot: 'green', pulse: true },
  paused: { label: 'Pausiert', dot: 'amber', pulse: false },
  draft: { label: 'In Einrichtung', dot: 'slate', pulse: false },
};

const GEWERK_LABEL: Record<string, string> = {
  elektriker: 'Elektriker',
  maler: 'Maler',
  shk: 'SHK · Sanitär, Heizung, Klima',
  tischler: 'Tischler',
  sonstiges: 'Handwerksbetrieb',
};

export default function BerndDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [config, setConfig] = useState<BerndConfig | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('steckbrief');

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

        // Erstes Projekt mit vorhandener Bernd-Config finden (neueste zuerst).
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
      } catch (err) {
        console.error('Bernd-Dashboard init fehlgeschlagen', err);
        router.push('/bernd/onboarding');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [router]);

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/bernd');
  };

  if (loading || !projectId || !config) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 text-slate-400">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
          <HardHat size={22} className="animate-pulse text-indigo-500" />
        </div>
        <p className="text-sm">Bernd wird geladen…</p>
      </div>
    );
  }

  const status = STATUS_META[config.status] ?? STATUS_META.draft;
  const gewerkLabel = config.gewerk ? GEWERK_LABEL[config.gewerk] ?? config.gewerk : 'Handwerksbetrieb';

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100/60 font-sans">
      {/* Schlanke Topbar */}
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4 sm:px-6">
        <span className="text-sm font-bold tracking-tight text-slate-900">
          axantilo<span className="text-indigo-600">.</span>
        </span>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          title="Ausloggen"
        >
          <LogOut size={15} /> Abmelden
        </button>
      </nav>

      <div className="mx-auto max-w-4xl px-5 pb-24 sm:px-6">
        {/* ── Bernd-Identität (Hero) ── */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-24px_rgba(79,70,229,0.25)] sm:p-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-gradient-to-br from-indigo-200/50 to-indigo-400/10 blur-3xl"
          />
          <div className="relative flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-lg shadow-indigo-600/25">
              <HardHat size={26} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bernd</h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
                  <StatusDot color={status.dot} pulse={status.pulse} />
                  {status.label}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                Dein digitaler Mitarbeiter · <span className="font-medium text-slate-600">{gewerkLabel}</span>
              </p>
            </div>
          </div>
        </div>

        {/* ── Segmentierte Tabs (gleitender Indikator) ── */}
        <div className="sticky top-3 z-10 mt-5">
          <div className="flex gap-1 rounded-2xl border border-slate-200/70 bg-white/85 p-1 shadow-sm backdrop-blur">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="relative flex-1 rounded-xl px-2 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-300"
                >
                  {isActive && (
                    <motion.span
                      layoutId="bernd-tab-active"
                      className="absolute inset-0 rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 shadow-sm shadow-indigo-600/25"
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span
                    className={`relative z-10 flex items-center justify-center gap-2 text-sm font-semibold transition-colors ${
                      isActive ? 'text-white' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Icon size={16} />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Inhalt ── */}
        <div className="mt-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {activeTab === 'steckbrief' && (
                <div className="flex flex-col gap-5">
                  <PairingCard projectId={projectId} />
                  <Steckbrief projectId={projectId} config={config} />
                </div>
              )}
              {activeTab === 'wissen' && <WissenView projectId={projectId} />}
              {activeTab === 'aendern' && <AenderungsChat projectId={projectId} />}
              {activeTab === 'logs' && <LogsWorkflows projectId={projectId} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
