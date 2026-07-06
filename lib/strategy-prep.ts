/** Fünf echte Pipeline-Schritte — je ein Balken in der Prep-UI. */
export const STRATEGY_PREP_STEPS = [
  {
    id: 'onboarding',
    label: 'Deine Angaben',
    running: 'Deine Onboarding-Angaben werden eingeordnet…',
    done: 'Angaben verarbeitet — wir kennen deinen Kontext.',
    detailRunning: 'Firma, Branche, Ziel und Teamgröße fließen in den Coach ein.',
    avgMs: 800,
  },
  {
    id: 'research',
    label: 'Firmenrecherche',
    running: 'Wir recherchieren dein Unternehmen im Web…',
    done: 'Firmenrecherche abgeschlossen.',
    detailRunning: 'Öffentliche Infos zu Angebot, Zielgruppe und Schwerpunkten.',
    avgMs: 12_000,
  },
  {
    id: 'sector',
    label: 'Branchen-Wissen',
    running: 'Branchen-Wissen wird geladen…',
    done: 'Passende Branchen-Erfahrung ist da.',
    detailRunning: 'Typische Prozesse und Automatisierungs-Chancen für deine Branche.',
    avgMs: 4_000,
  },
  {
    id: 'analysis',
    label: 'Zeitfresser & Chancen',
    running: 'Wir leiten wahrscheinliche Zeitfresser und Chancen ab…',
    done: 'Hypothesen und Lösungsrichtungen stehen.',
    detailRunning: 'Firmenbild, Branchen-Kontext, Hypothesen und erste Automatisierungs-Ideen.',
    avgMs: 14_000,
  },
  {
    id: 'conversation',
    label: 'Gesprächsplan',
    running: 'Dein persönlicher Gesprächsplan wird geschrieben…',
    done: 'Gesprächsstrategie fertig — gleich geht es los.',
    detailRunning: 'Erwartete Einwände, Einstieg und offene Fragen für Phase 1.',
    avgMs: 10_000,
  },
] as const;

export type StrategyPrepStepId = (typeof STRATEGY_PREP_STEPS)[number]['id'];
export type StrategyPrepStepStatus = 'pending' | 'running' | 'done' | 'skipped';

export type StrategyPrepStepState = {
  id: StrategyPrepStepId;
  status: StrategyPrepStepStatus;
  message?: string;
  detail?: string;
};

export type StrategyPrepProgress = {
  steps: StrategyPrepStepState[];
  currentIndex: number;
  startedAt: string;
  updatedAt: string;
  done?: boolean;
  error?: string;
};

export function createInitialPrepProgress(): StrategyPrepProgress {
  const now = new Date().toISOString();
  return {
    steps: STRATEGY_PREP_STEPS.map(s => ({ id: s.id, status: 'pending' as const })),
    currentIndex: 0,
    startedAt: now,
    updatedAt: now,
  };
}

export function applyPrepStep(
  progress: StrategyPrepProgress,
  stepIndex: number,
  status: StrategyPrepStepStatus,
  message?: string,
  detail?: string,
): StrategyPrepProgress {
  const stepDef = STRATEGY_PREP_STEPS[stepIndex];
  const steps: StrategyPrepStepState[] = progress.steps.map((s, i) => {
    if (i < stepIndex) {
      return { ...s, status: s.status === 'skipped' ? 'skipped' as const : 'done' as const };
    }
    if (i === stepIndex) {
      return {
        ...s,
        status,
        message: message ?? (status === 'running' ? stepDef.running : status === 'done' ? stepDef.done : s.message),
        detail: detail ?? (status === 'running' ? stepDef.detailRunning : s.detail),
      };
    }
    return { ...s, status: 'pending' as const };
  });
  return {
    ...progress,
    steps,
    currentIndex: status === 'done' && stepIndex < STRATEGY_PREP_STEPS.length - 1
      ? stepIndex + 1
      : stepIndex,
    updatedAt: new Date().toISOString(),
    done: stepIndex === STRATEGY_PREP_STEPS.length - 1 && status === 'done',
  };
}

/** Grobe Restzeit aus verbleibenden Schritten (inkl. laufendem). */
export function estimatePrepSecondsRemaining(progress: StrategyPrepProgress | null): number | null {
  if (!progress || progress.done) return progress?.done ? 0 : null;
  let ms = 0;
  for (let i = progress.currentIndex; i < STRATEGY_PREP_STEPS.length; i++) {
    const st = progress.steps[i]?.status;
    if (st === 'done' || st === 'skipped') continue;
    ms += STRATEGY_PREP_STEPS[i].avgMs * (st === 'running' ? 0.55 : 1);
  }
  return Math.max(3, Math.round(ms / 1000));
}

export function prepProgressPercent(progress: StrategyPrepProgress | null): number {
  if (!progress) return 0;
  if (progress.done) return 100;
  const doneCount = progress.steps.filter(s => s.status === 'done' || s.status === 'skipped').length;
  const runningBonus = progress.steps.some(s => s.status === 'running') ? 0.35 : 0;
  return Math.min(98, Math.round(((doneCount + runningBonus) / STRATEGY_PREP_STEPS.length) * 100));
}

export function parsePrepProgress(raw: unknown): StrategyPrepProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.steps)) return null;
  return {
    steps: o.steps as StrategyPrepStepState[],
    currentIndex: typeof o.currentIndex === 'number' ? o.currentIndex : 0,
    startedAt: typeof o.startedAt === 'string' ? o.startedAt : new Date().toISOString(),
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
    done: o.done === true,
    error: typeof o.error === 'string' ? o.error : undefined,
  };
}
