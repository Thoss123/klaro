'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  MessageSquare,
  Map,
  Blocks,
  Play,
  ChevronRight,
} from 'lucide-react';
import { section, sectionY, h2, lead } from './landing-styles';

const LOOP = [
  {
    icon: MessageSquare,
    title: 'Verstehen',
    body: 'Klaro fragt nach deinem Alltag — was nervt, was dauert zu lange, welche Tools ihr schon nutzt. Eine Frage nach der anderen.',
    accent: 'bg-sky-50 text-sky-700 border-sky-100',
  },
  {
    icon: Map,
    title: 'Planen',
    body: 'Engpässe, Tools und der konkrete Plan erscheinen live auf deiner Roadmap — priorisiert und aus dem, was du erzählt hast.',
    accent: 'bg-violet-50 text-violet-700 border-violet-100',
  },
  {
    icon: Blocks,
    title: 'Bauen',
    body: 'Klaro baut den Ablauf: von der Auslösung über KI und Freigabe bis zum Versand. Du ergänzt nur Zugänge und Freigaben.',
    accent: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  },
  {
    icon: Play,
    title: 'Live-Schalten',
    body: 'Automatisierung starten, kurz testen — dann läuft sie bei dir und entlastet den Alltag im Betrieb.',
    accent: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  },
};

const header = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export default function AgentLoop() {
  const [replay, setReplay] = useState(0);
  const [highlight, setHighlight] = useState(false);

  useEffect(() => {
    let highlightTimer: ReturnType<typeof setTimeout> | undefined;

    const onScrollSection = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string }>).detail;
      if (detail?.id !== 'so-arbeitet-klaro') return;
      setReplay((k) => k + 1);
      setHighlight(true);
      if (highlightTimer) clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => setHighlight(false), 1400);
    };

    window.addEventListener('klaro-scroll-section', onScrollSection);
    return () => {
      window.removeEventListener('klaro-scroll-section', onScrollSection);
      if (highlightTimer) clearTimeout(highlightTimer);
    };
  }, []);

  const animateCards = replay > 0 ? 'show' : undefined;

  return (
    <section
      className={`${section} ${sectionY} bg-slate-50 border-y border-gray-200/80 scroll-mt-24 transition-shadow duration-700 ${
        highlight ? 'ring-2 ring-inset ring-indigo-200/80' : ''
      }`}
      id="so-arbeitet-klaro"
    >
      <motion.h2
        className={h2}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
        variants={header}
      >
        So arbeitet Klaro
      </motion.h2>
      <motion.p
        className={lead}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
        variants={header}
      >
        Vom Planen bis zur Umsetzung — Gespräch, Roadmap und umsetzbare
        Automatisierungen in einem Flow.
      </motion.p>

      <motion.div
        key={replay}
        variants={container}
        initial="hidden"
        animate={animateCards}
        whileInView={replay === 0 ? 'show' : undefined}
        viewport={{ once: true, amount: 0.15, margin: '0px 0px -60px 0px' }}
        className="mt-14 max-w-2xl mx-auto lg:max-w-none"
      >
        <div className="grid lg:grid-cols-4 gap-4 lg:gap-8">
          {LOOP.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div key={step.title} variants={item} className="relative">
                <div className="h-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                  <span
                    className={`inline-flex items-center justify-center h-11 w-11 rounded-xl border ${step.accent}`}
                  >
                    <Icon size={22} />
                  </span>
                  <p className="mt-4 text-xs font-mono text-gray-400">
                    Schritt {i + 1}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-gray-900">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                    {step.body}
                  </p>
                </div>
                {i < LOOP.length - 1 && (
                  <span
                    className="hidden lg:grid absolute -right-5 top-1/2 -translate-y-1/2 z-10 h-9 w-9 place-items-center rounded-full bg-white border border-gray-200 shadow-md text-indigo-600"
                    aria-hidden
                  >
                    <ChevronRight size={20} strokeWidth={2.5} />
                  </span>
                )}
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </section>
  );
}
