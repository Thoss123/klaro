'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import {
  STRATEGY_PREP_STEPS,
  createInitialPrepProgress,
  estimatePrepSecondsRemaining,
  parsePrepProgress,
  prepProgressPercent,
  type StrategyPrepProgress,
} from '@/lib/strategy-prep';

type Props = {
  vorname?: string;
  /** Live vom Stream (Onboarding) */
  progress?: StrategyPrepProgress | null;
  /** Polling-Fallback (Chat-Reload / paralleler Tab) */
  sessionId?: string | null;
};

function StepBar({ status, label }: { status: string; label: string }) {
  const isDone = status === 'done' || status === 'skipped';
  const isRunning = status === 'running';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-xs font-medium truncate ${
            isDone ? 'text-indigo-700' : isRunning ? 'text-gray-800' : 'text-gray-400'
          }`}
        >
          {label}
        </span>
        {isDone && (
          <Check size={14} className="shrink-0 text-indigo-600" aria-hidden />
        )}
        {isRunning && (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-indigo-600 animate-pulse">
            läuft
          </span>
        )}
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
        {isDone && (
          <motion.div
            className="h-full rounded-full bg-indigo-600"
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          />
        )}
        {isRunning && (
          <div className="relative h-full w-full overflow-hidden rounded-full bg-indigo-100">
            <motion.div
              className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-indigo-600"
              animate={{ x: ['-40%', '260%'] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Vollbild-Ladezustand — 5 Balken für echte Pipeline-Schritte. */
export default function StrategyPrepScreen({ vorname, progress: progressProp, sessionId }: Props) {
  const [polledProgress, setPolledProgress] = useState<StrategyPrepProgress | null>(null);

  useEffect(() => {
    if (progressProp || !sessionId) return;
    let cancelled = false;
    let failStreak = 0;

    const poll = async () => {
      if (cancelled || failStreak >= 3) return;
      try {
        const res = await fetch(`/api/strategy/progress?sessionId=${encodeURIComponent(sessionId)}`);
        if (cancelled) return;
        if (!res.ok) {
          failStreak += 1;
          return;
        }
        failStreak = 0;
        const data = await res.json();
        const p = parsePrepProgress(data.progress);
        if (p) setPolledProgress(p);
        if (data.ready || p?.done) {
          failStreak = 3;
        }
      } catch {
        failStreak += 1;
      }
    };

    void poll();
    const t = setInterval(poll, 700);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [progressProp, sessionId]);

  const progress = progressProp ?? polledProgress ?? createInitialPrepProgress();
  const runningIdx = progress.steps.findIndex(s => s.status === 'running');
  const activeIdx = runningIdx >= 0 ? runningIdx : progress.currentIndex;
  const activeStep = progress.steps[activeIdx];
  const activeDef = STRATEGY_PREP_STEPS[activeIdx];
  const mainMessage =
    activeStep?.message ??
    (progress.done ? 'Dein Coach ist bereit — einen Moment…' : activeDef?.running ?? 'Wir richten deinen Coach ein…');
  const detailMessage =
    activeStep?.detail ??
    (progress.done ? 'Gleich startet dein erstes Gespräch.' : activeDef?.detailRunning ?? '');

  const secondsLeft = estimatePrepSecondsRemaining(progress);
  const overallPct = prepProgressPercent(progress);
  const greeting = vorname?.trim() ? `Hey ${vorname.trim()},` : 'Einen Moment,';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-600 text-white font-bold text-lg mx-auto mb-5 shadow-lg">
            K
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {greeting} wir richten deinen Coach ein
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed max-w-md mx-auto">
            Axantilo bereitet dein Gespräch Schritt für Schritt vor — jeder Balken ist ein echter
            Zwischenschritt, kein Fake-Fortschritt.
          </p>
        </div>

        <div className="space-y-3 mb-8">
          {STRATEGY_PREP_STEPS.map((def, i) => (
            <StepBar
              key={def.id}
              label={def.label}
              status={progress.steps[i]?.status ?? 'pending'}
            />
          ))}
        </div>

        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-4 mb-4 min-h-[88px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeIdx}-${mainMessage}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-sm font-semibold text-indigo-900 leading-snug">{mainMessage}</p>
              {detailMessage && (
                <p className="text-xs text-indigo-700/80 mt-2 leading-relaxed">{detailMessage}</p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500 px-1">
          <span>{overallPct}% abgeschlossen</span>
          <span>
            {progress.done
              ? 'Fertig'
              : secondsLeft != null && secondsLeft > 0
                ? `Noch ca. ${secondsLeft} Sek.`
                : 'Fast fertig…'}
          </span>
        </div>
      </div>
    </div>
  );
}
