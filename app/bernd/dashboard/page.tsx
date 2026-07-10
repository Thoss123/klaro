"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, IdCard, BookOpen, MessagesSquare, ListChecks } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { loadProjects } from '@/lib/supabase-chat';
import { Logo } from '@/components/Logo';
import { Steckbrief } from '@/components/bernd/Steckbrief';
import { WissenView } from '@/components/bernd/WissenView';
import { AenderungsChat } from '@/components/bernd/AenderungsChat';
import { LogsWorkflows } from '@/components/bernd/LogsWorkflows';
import { PairingCard } from '@/components/bernd/PairingCard';
import type { BerndConfig } from '@/lib/bernd/types';

/**
 * Bernd-Dashboard (Architekturplan §5 Screen 3, Login-Startpunkt sobald eine Instanz
 * existiert). Session-Guard wie app/dashboard/page.tsx; ermittelt das erste Projekt mit
 * einer `bernd_configs`-Zeile — ohne Config geht es zurück ins Onboarding (kein Wizard-
 * Zwischenschritt hier, da /bernd/onboarding das bereits übernimmt).
 */

type TabKey = 'steckbrief' | 'wissen' | 'aendern' | 'logs';

const TABS: { key: TabKey; label: string; icon: typeof IdCard }[] = [
  { key: 'steckbrief', label: 'Steckbrief', icon: IdCard },
  { key: 'wissen', label: 'Bernds Wissen', icon: BookOpen },
  { key: 'aendern', label: 'Ändern', icon: MessagesSquare },
  { key: 'logs', label: 'Logs & Workflows', icon: ListChecks },
];

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

        // Erstes Projekt mit vorhandener Bernd-Config finden (neueste Projekte zuerst,
        // loadProjects() sortiert bereits nach created_at desc).
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
    router.push('/');
  };

  if (loading || !projectId || !config) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-gray-400 text-sm">
        Lade Bernd…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <nav className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo height={28} />
          <span className="text-sm font-semibold text-gray-400">Bernd</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-gray-100"
          title="Ausloggen"
        >
          <LogOut size={18} />
        </button>
      </nav>

      <div className="max-w-4xl mx-auto px-6 pb-20">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Dein Bernd-Dashboard</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {config.gewerk ? `Gewerk: ${config.gewerk}` : 'Noch kein Gewerk hinterlegt'} · Status: {config.status}
          </p>
        </div>

        <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon size={15} /> {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-6">
          {activeTab === 'steckbrief' && (
            <>
              <Steckbrief projectId={projectId} config={config} />
              <PairingCard projectId={projectId} />
            </>
          )}
          {activeTab === 'wissen' && <WissenView projectId={projectId} />}
          {activeTab === 'aendern' && <AenderungsChat projectId={projectId} />}
          {activeTab === 'logs' && <LogsWorkflows projectId={projectId} />}
        </div>
      </div>
    </div>
  );
}
