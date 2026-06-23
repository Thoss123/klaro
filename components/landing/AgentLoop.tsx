'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, BarChart3, Map, Rocket, ChevronRight } from 'lucide-react';
import { section, sectionY, h2, lead } from './landing-styles';

/** Customer-facing phase copy — aligned with lib/claude.ts phase prompts. */
const PHASES = [
  {
    icon: Search,
    phase: 'Diagnose',
    alias: 'Verstehen',
    title: 'Du beschreibst eure Abläufe — Axantilo versteht, wo Zeit verloren geht.',
    body:
      'Im Gespräch gehst du Schritt für Schritt durch, wie es bei euch wirklich läuft: was nervt, wie oft, wie lange, wer es macht. Gesammelt werden zeitfressende Stellen und eure Ideen — noch ohne Bewertung, ohne Tool-Tipps und ohne Lösungen. Dein Plan rechts füllt sich live mit.',
    accent: 'bg-sky-50 text-sky-700 border-sky-100',
  },
  {
    icon: BarChart3,
    phase: 'Analyse',
    alias: 'Einordnen',
    title: 'Du sagst, womit ihr heute arbeitet — und was zuerst dran ist.',
    body:
      'Pro Stelle klärst du die Tools, die ihr wirklich nutzt (Excel, Gmail, Canva …). Danach sortiert ihr gemeinsam nach Aufwand, Hebel und Häufigkeit. Es geht nur um den Ist-Stand und die Priorität — keine neuen Tools, kein Workflow-Entwurf.',
    accent: 'bg-violet-50 text-violet-700 border-violet-100',
  },
  {
    icon: Map,
    phase: 'Plan',
    alias: 'Planen',
    title: 'Ihr entwerft pro Stelle den konkreten Ablauf — mit KI, Freigaben und klaren Schritten.',
    body:
      'Axantilo baut auf dem Gespräch auf und fragt nur, was noch fehlt. Ihr klärt, was automatisiert wird, wo jemand freigibt, und bestätigt den Ansatz. Daraus entstehen fertige Ablauf-Pläne — technisch noch nicht umgesetzt.',
    accent: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  },
  {
    icon: Rocket,
    phase: 'Umsetzung',
    alias: 'Live-Schalten',
    title: 'Du wählst einen Plan — Axantilo baut, du verbindest, testest und schaltest live.',
    body:
      'Du entscheidest, womit du anfängst. Der Ablauf erscheint im Editor, du prüfst die Schritte, richtest Zugänge ein (z. B. Gmail in wenigen Klicks), führst einen Testlauf durch — dann läuft er bei euch.',
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
      if (detail?.id !== 'so-arbeitet-axantilo') return;
      setReplay((k) => k + 1);
      setHighlight(true);
      if (highlightTimer) clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => setHighlight(false), 1400);
    };

    window.addEventListener('axantilo-scroll-section', onScrollSection);
    return () => {
      window.removeEventListener('axantilo-scroll-section', onScrollSection);
      if (highlightTimer) clearTimeout(highlightTimer);
    };
  }, []);

  const animateCards = replay > 0 ? 'show' : undefined;

  return (
    <section
      className={`${section} ${sectionY} bg-slate-50 border-y border-gray-200/80 scroll-mt-24 transition-shadow duration-700 ${
        highlight ? 'ring-2 ring-inset ring-indigo-200/80' : ''
      }`}
      id="so-arbeitet-axantilo"
    >
      <motion.h2
        className={h2}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
        variants={header}
      >
        In 4 Phasen zur laufenden Automatisierung
      </motion.h2>
      <motion.p
        className={lead}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
        variants={header}
      >
        Von „Wir sollten was mit KI machen“ bis „Es läuft“ — vier Schritte im
        gleichen Chat, mit live aktualisiertem Plan.
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
          {PHASES.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div key={step.phase} variants={item} className="relative">
                <div className="h-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                  <span
                    className={`inline-flex items-center justify-center h-11 w-11 rounded-xl border ${step.accent}`}
                  >
                    <Icon size={22} />
                  </span>
                  <div className="mt-4 flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-400">
                      Phase {i + 1}
                    </span>
                    <span className="text-[10px] font-medium text-gray-400 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">
                      {step.alias}
                    </span>
                  </div>
                  <h3 className="mt-2 text-base sm:text-lg font-bold text-gray-900 leading-snug">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                    {step.body}
                  </p>
                </div>
                {i < PHASES.length - 1 && (
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
