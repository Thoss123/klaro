'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bot,
  Zap,
  Cpu,
  User,
  ChevronRight,
  Check,
  Rocket,
  Loader2,
  ArrowUp,
} from 'lucide-react';
import { SiGmail, SiGooglesheets } from 'react-icons/si';

const STEPS = [
  { id: 'chat', label: 'Verstehen' },
  { id: 'canvas', label: 'Planen' },
  { id: 'build', label: 'Bauen' },
  { id: 'deploy', label: 'Live' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

const CYCLE_MS = 4200;

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
    let i = 0;
    const ids = STEPS.map((s) => s.id);
    const tick = () => {
      i = (i + 1) % ids.length;
      setActive(ids[i]);
    };
    const t = setInterval(tick, CYCLE_MS);
    return () => clearInterval(t);
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
                active === s.id
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-400'
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
              className="space-y-4"
            >
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <Bot size={18} className="text-blue-600" />
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-gray-800 text-sm leading-relaxed">
                  Welche Aufgabe frisst bei euch jede Woche am meisten Zeit?
                </div>
              </div>
              <div className="flex justify-end">
                <p className="text-sm text-gray-800 rounded-2xl rounded-tr-sm bg-indigo-50 border border-indigo-100 px-4 py-3 max-w-[90%]">
                  Angebote — jedes Mal von Null, 3–4 Stunden pro Woche.
                </p>
              </div>
              <p className="flex items-center gap-2 text-xs text-indigo-600 font-medium">
                <Loader2 size={12} className="animate-spin" />
                Dein Plan wird aktualisiert…
              </p>
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
                Roadmap · Plan
              </p>
              <div className="rounded-xl border border-gray-200 bg-slate-50 p-4">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <span className="text-sm font-semibold text-gray-900">
                    Angebote automatisieren
                  </span>
                  <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                    Hoch
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  CRM → KI-Entwurf → Freigabe → Versand
                </p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {['Gmail', 'Sheets', 'Slack'].map((t) => (
                    <span
                      key={t}
                      className="text-[10px] text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded-md"
                    >
                      {t}
                    </span>
                  ))}
                </div>
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
                Ablauf
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <WorkflowNode icon={<Zap size={12} />} label="Trigger" color="#f59e0b" />
                <Arrow />
                <WorkflowNode
                  icon={<SiGooglesheets className="text-[#34A853]" size={14} />}
                  label="Sheets"
                  color="#34A853"
                />
                <Arrow />
                <WorkflowNode icon={<Cpu size={12} />} label="KI" color="#6366f1" />
                <Arrow />
                <WorkflowNode icon={<User size={12} />} label="Freigabe" color="#8b5cf6" />
                <Arrow />
                <WorkflowNode
                  icon={<SiGmail className="text-[#EA4335]" size={14} />}
                  label="Versand"
                  color="#EA4335"
                />
              </div>
            </motion.div>
          )}

          {active === 'deploy' && (
            <motion.div
              key="deploy"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center py-8 text-center"
            >
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 mb-3">
                <Check size={24} strokeWidth={2.5} />
              </span>
              <p className="text-base font-bold text-gray-900">Automatisierung bereit</p>
              <p className="text-sm text-gray-500 mt-1">Livegang & Testlauf im Chat</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-white bg-emerald-600 px-4 py-2 rounded-xl pointer-events-none">
                <Rocket size={16} />
                Jetzt ausführen
              </span>
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

function WorkflowNode({
  icon,
  label,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
}) {
  return (
    <div
      className="rounded-lg border border-gray-200 bg-white px-2 py-2 flex flex-col items-center gap-1 min-w-[3.5rem] shadow-sm"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      {icon}
      <span className="text-[10px] font-semibold text-gray-700">{label}</span>
    </div>
  );
}

function Arrow() {
  return <ChevronRight size={14} className="text-gray-300 shrink-0 hidden sm:block" />;
}
