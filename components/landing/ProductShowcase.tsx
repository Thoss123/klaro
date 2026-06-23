'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import LandingWorkflowEditor from './LandingWorkflowEditor';
import LandingPlanFlowPreview from './LandingPlanFlowPreview';
import ShowcasePhase1Chat from './ShowcasePhase1Chat';

const STEPS = [
  { id: 'chat', label: 'Verstehen' },
  { id: 'canvas', label: 'Einordnen' },
  { id: 'build', label: 'Planen' },
  { id: 'deploy', label: 'Live' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

const STEP_MS: Record<StepId, number> = {
  chat: 9800,
  canvas: 4800,
  build: 7800,
  deploy: 5800,
};

const ANALYSE_ITEMS = [
  {
    title: 'Angebote manuell',
    tools: ['Excel', 'Gmail'],
    rank: 1,
    note: 'Ist-Tools erfasst · schnellster Hebel',
  },
  {
    title: 'E-Mail-Flut',
    tools: ['Outlook'],
    rank: 2,
    note: 'Priorität bestätigt',
  },
];

export default function ProductShowcase() {
  const router = useRouter();
  const [active, setActive] = useState<StepId>('chat');
  const [intro, setIntro] = useState('');

  const startWithIntro = () => {
    const text = intro.trim();
    if (text) localStorage.setItem('axantilo_intro_message', text);
    router.push('/onboarding');
  };

  useEffect(() => {
    const ids = STEPS.map((s) => s.id);
    let idx = 0;
    let timeout: ReturnType<typeof setTimeout>;

    const schedule = () => {
      timeout = setTimeout(() => {
        idx = (idx + 1) % ids.length;
        setActive(ids[idx]);
        schedule();
      }, STEP_MS[ids[idx]]);
    };

    schedule();
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-3xl shadow-xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 pb-4 mb-4 border-b border-gray-100">
        <div className="flex items-center gap-3 min-w-0">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white font-bold tracking-tight text-sm">
            K
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 leading-none truncate">
              Axantilo Coach
            </p>
            <p className="text-xs text-gray-400 mt-1">Online</p>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {STEPS.map((s) => (
            <span
              key={s.id}
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md transition-colors ${
                active === s.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-400'
              }`}
            >
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="min-h-[280px] sm:min-h-[300px]">
        <AnimatePresence mode="wait">
          {active === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
            >
              <ShowcasePhase1Chat />
            </motion.div>
          )}

          {active === 'canvas' && (
            <motion.div
              key="canvas"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">
                Phase 2 · Ist-Stand & Priorität
              </p>
              <div className="space-y-3">
                {ANALYSE_ITEMS.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-xl border border-gray-200 bg-slate-50 p-4"
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <span className="text-sm font-semibold text-gray-900">{item.title}</span>
                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                        #{item.rank}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">{item.note}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {item.tools.map((t) => (
                        <span
                          key={t}
                          className="text-[10px] text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded-md"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {active === 'build' && (
            <motion.div
              key="build"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">
                Phase 3 · Ablauf entsteht Schritt für Schritt
              </p>
              <LandingPlanFlowPreview />
              <p className="mt-3 text-xs text-gray-500 leading-relaxed">
                KI übernimmt den Entwurf — du behältst die Freigabe vor dem Versand.
              </p>
            </motion.div>
          )}

          {active === 'deploy' && (
            <motion.div
              key="deploy"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-3">
                Phase 4 · Bauen, testen, live schalten
              </p>
              <LandingWorkflowEditor />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          startWithIntro();
        }}
        className="flex items-end gap-2 mt-4 px-3 py-2 bg-gray-50 border border-gray-200 rounded-3xl focus-within:border-indigo-400 transition-colors"
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
              startWithIntro();
            }
          }}
          placeholder="Schreib einfach drauf los…"
          rows={1}
          className="flex-1 bg-transparent px-2 py-2 focus:outline-none text-gray-800 text-sm resize-none"
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

      <p className="mt-3 text-xs text-gray-400 text-center lg:text-left">
        Kostenlos · Keine Kreditkarte nötig
      </p>
    </div>
  );
}
