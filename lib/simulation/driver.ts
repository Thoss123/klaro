/**
 * The driver reproduces — headless and without a human — the orchestration loop
 * that app/chat/page.tsx runs in the browser: feed the customer's message to the
 * real /api/chat, read the streamed coach reply, parse its control tags, fire
 * the canvas worker, snapshot a checkpoint at each phase boundary, then let the
 * persona answer and repeat.
 *
 * It deliberately hits the *real* /api/chat so the actual phase prompts, tools
 * and provider behaviour are exercised. Canvas side-effects are reproduced
 * best-effort (the worker call) and folded into an in-memory canvas so the
 * mechanical judge has real artifacts to validate.
 */

import { normalizeCanvasData } from '@/lib/canvas-normalize';
import { stripInternalTags } from '@/lib/strip-internal-tags';
import type { CanvasData, OnboardingData, Phase, Workflow } from '@/lib/types';
import { generateInitialStrategy } from '@/lib/strategy';
import { getHiddenInitMessage } from '@/lib/phase-welcome';
import { filterCanvasHistory } from '@/lib/hidden-chat';
import { personaReply } from './persona-agent';
import { parseTurnSignals, parseCoachCanvasUpdate, parseWorkflowPlans } from './tags';
import { PHASE_ORDER } from './types';
import type {
  DriverOptions,
  PhaseCheckpoint,
  SimMessage,
  TranscriptTurn,
  TurnSignals,
} from './types';

const STREAM_RESET = '<stream_reset></stream_reset>';
const DEFAULT_MAX_TURNS = 12;
// Die gemergte Analyse macht die Arbeit der alten Phasen 2 + 3 (Ist-Tools,
// Tool-Bewertung, Priorisierung, Ablauf-Entwurf mit Ja-Gate pro Punkt) und
// braucht bei mehreren Punkten mehr Züge als eine reine Diagnose.
const ANALYSE_MAX_TURNS = 20;

function turnCapFor(phase: Phase, override?: number): number {
  if (typeof override === 'number') return override;
  return phase === 'analyse' ? ANALYSE_MAX_TURNS : DEFAULT_MAX_TURNS;
}

export interface SimulationOutput {
  transcript: TranscriptTurn[];
  checkpoints: PhaseCheckpoint[];
  finalCanvas: CanvasData;
  phasesRun: Phase[];
  /** Phases that hit the turn cap without the coach declaring them complete. */
  stalledPhases: Phase[];
}

function emptyCanvas(phase: Phase): CanvasData {
  return { pain_points: [], use_cases: [], workflows: [], documents: [], phase };
}

/** Read the /api/chat streamed body into the full raw coach output. */
async function readStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

/** Visible coach text: drop everything before the last stream_reset, strip tags. */
function visibleCoachText(raw: string): string {
  const idx = raw.lastIndexOf(STREAM_RESET);
  const tail = idx >= 0 ? raw.slice(idx + STREAM_RESET.length) : raw;
  return stripInternalTags(tail);
}

/** Coerce a coach <workflow_plan> JSON blob into a Workflow for local validation. */
function planToWorkflow(plan: Record<string, unknown>, idx: number): Workflow | null {
  if (!Array.isArray(plan.steps)) return null;
  return {
    id: typeof plan.id === 'string' ? plan.id : `sim_plan_${idx}`,
    title: typeof plan.title === 'string' ? plan.title : `Plan ${idx + 1}`,
    linked_pain_point: typeof plan.pain_point_id === 'string' ? plan.pain_point_id : '',
    steps: plan.steps as Workflow['steps'],
    edges: Array.isArray(plan.edges) ? (plan.edges as Workflow['edges']) : [],
  };
}

async function callCoachOnce(
  baseUrl: string,
  messages: SimMessage[],
  onboarding: Record<string, unknown>,
  phase: Phase,
  canvas: CanvasData,
  strategie: string | null,
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // strategie wird direkt mitgegeben (kein DB-Projekt im Harness), damit der
    // Coach — wie in der echten App — strategie-geleitet startet.
    body: JSON.stringify({ messages, onboarding, phase, canvas: { ...canvas, phase }, strategie }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`/api/chat ${res.status}: ${detail.slice(0, 200)}`);
  }
  return readStream(res.body);
}

/**
 * Coach call with one retry: the coach can transiently fail (Mistral 429 + an
 * unreachable fallback). A short pause + retry rides out a cleared rate limit
 * instead of aborting the whole run.
 */
async function callCoach(
  baseUrl: string,
  messages: SimMessage[],
  onboarding: Record<string, unknown>,
  phase: Phase,
  canvas: CanvasData,
  strategie: string | null,
): Promise<string> {
  try {
    return await callCoachOnce(baseUrl, messages, onboarding, phase, canvas, strategie);
  } catch (e) {
    await new Promise(r => setTimeout(r, 8000));
    try {
      return await callCoachOnce(baseUrl, messages, onboarding, phase, canvas, strategie);
    } catch {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }
}

/** Best-effort canvas-worker call (phases 2–4). Returns the updated canvas or null. */
async function runCanvasWorker(
  baseUrl: string,
  history: SimMessage[],
  canvas: CanvasData,
  onboarding: Record<string, unknown>,
  phase: Phase,
): Promise<CanvasData | null> {
  try {
    const res = await fetch(`${baseUrl}/api/canvas-worker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history, currentCanvas: canvas, onboarding, phase, projectId: null }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.status === 'success' && data.canvas) {
      return normalizeCanvasData(data.canvas as Record<string, unknown>, canvas, phase);
    }
  } catch {
    // worker is best-effort in the harness — a failure just leaves the canvas as-is
  }
  return null;
}

/** Apply a coach turn's canvas side-effects to the in-memory canvas. */
async function applyCanvasEffects(
  signals: TurnSignals,
  raw: string,
  baseUrl: string,
  dialogue: SimMessage[],
  canvas: CanvasData,
  onboarding: Record<string, unknown>,
  phase: Phase,
): Promise<CanvasData> {
  let next = canvas;
  // Direkter Coach-Canvas-Schreibvorgang via <canvas_update> — wie im echten
  // app/chat applyCoachCanvasUpdate: das VOLLSTÄNDIGE JSON falten (company,
  // pain_points UND idea_cards / tool_evaluations / solution_structures), unter
  // der jeweiligen Phase (diagnose: idea_cards; analyse: Tool-Bewertungen etc.).
  if (signals.coachCanvasWrite) {
    const parsed = parseCoachCanvasUpdate(raw);
    if (parsed) {
      next = normalizeCanvasData(parsed, next, phase);
    }
  }
  // Phases 2–4: worker LLM extracts the canvas.
  if (signals.canvasTrigger) {
    const updated = await runCanvasWorker(baseUrl, dialogue, next, onboarding, phase);
    if (updated) next = updated;
  }
  // Phase 3: fold workflow plans locally so the mechanical judge can validate them.
  if (signals.workflowPlan) {
    const plans = parseWorkflowPlans(raw)
      .map((p, i) => planToWorkflow(p, (next.workflow_plans?.length ?? 0) + i))
      .filter((w): w is Workflow => w !== null);
    if (plans.length) {
      next = { ...next, workflow_plans: [...(next.workflow_plans ?? []), ...plans] };
    }
  }
  return next;
}

/**
 * Run a simulation. If `seed` is given (resume), the run continues AFTER that
 * checkpoint's phase using its dialogue + canvas, so "phase 1 & 2 unchanged,
 * redo phase 3" only re-simulates the later phase(s).
 */
export async function runSimulation(
  opts: DriverOptions,
  seed?: PhaseCheckpoint,
): Promise<SimulationOutput> {
  const onboarding: Record<string, unknown> = seed?.onboarding ?? { ...opts.persona.onboarding };

  let allPhases = opts.phases ?? PHASE_ORDER;
  if (seed) {
    const after = PHASE_ORDER.indexOf(seed.phase);
    allPhases = allPhases.filter(p => PHASE_ORDER.indexOf(p) > after);
  }

  const transcript: TranscriptTurn[] = [];
  const checkpoints: PhaseCheckpoint[] = seed ? [seed] : [];
  const stalledPhases: Phase[] = [];
  const phasesRun: Phase[] = [];

  const dialogue: SimMessage[] = seed ? [...seed.messages] : [];
  let canvas: CanvasData = seed ? seed.canvas : emptyCanvas(allPhases[0] ?? 'diagnose');
  let turnCounter = transcript.length;

  // Interne Strategie einmal generieren (wie in der echten App nach dem Onboarding)
  // und bei jedem Coach-Call mitgeben. Bei Resume aus dem Checkpoint übernehmen.
  // Fail-open: bei Fehler läuft der Coach ohne Strategie.
  let strategie: string | null = seed?.strategie ?? null;
  if (!strategie) {
    try {
      strategie = await generateInitialStrategy({
        onboarding: onboarding as Partial<OnboardingData>,
        recherche: null,
      });
    } catch {
      // Strategie ist best-effort — ein Fehler darf den Lauf nicht abbrechen.
    }
  }
  await opts.onStrategy?.(strategie);

  // Ein Coach-Zug: /api/chat rufen, Zug protokollieren, Canvas-Effekte anwenden.
  // Gibt zurück, ob der Coach die Phase abgeschlossen hat.
  const runCoachTurn = async (phase: Phase): Promise<boolean> => {
    const raw = await callCoach(opts.baseUrl, dialogue, onboarding, phase, canvas, strategie);
    const visible = visibleCoachText(raw);
    const signals = parseTurnSignals(raw);
    dialogue.push({ role: 'assistant', content: visible });
    const coachTurn: TranscriptTurn = {
      turn: turnCounter++, phase, role: 'coach', content: visible, raw, signals,
    };
    transcript.push(coachTurn);
    await opts.onTurn?.(coachTurn);
    canvas = await applyCanvasEffects(signals, raw, opts.baseUrl, dialogue, canvas, onboarding, phase);
    return !!signals.phaseComplete;
  };

  for (const phase of allPhases) {
    phasesRun.push(phase);
    canvas = { ...canvas, phase };
    let completed = false;

    // Phasen-Kickoff wie in der echten App: eine versteckte System-Nachricht
    // startet die Phase, und der COACH spricht ZUERST (Begrüßung in diagnose,
    // Phasen-Einleitung sonst). Erst danach antwortet die Persona.
    dialogue.push({ role: 'user', content: getHiddenInitMessage(phase) });
    completed = await runCoachTurn(phase);

    const maxTurns = turnCapFor(phase, opts.maxTurnsPerPhase);
    for (let t = 0; t < maxTurns && !completed; t++) {
      // 1. Kunde antwortet dem Coach (versteckte Kickoff-Zeilen sieht die Persona nicht).
      const customerMsg = await personaReply({
        persona: opts.persona,
        phase,
        dialogue: filterCanvasHistory(dialogue),
      });
      dialogue.push({ role: 'user', content: customerMsg });
      const customerTurn: TranscriptTurn = {
        turn: turnCounter++, phase, role: 'customer', content: customerMsg, signals: {},
      };
      transcript.push(customerTurn);
      await opts.onTurn?.(customerTurn);

      // 2. Coach antwortet (echtes /api/chat).
      completed = await runCoachTurn(phase);
    }

    if (!completed) stalledPhases.push(phase);

    const checkpoint: PhaseCheckpoint = {
      phase,
      messages: [...dialogue],
      canvas: { ...canvas, phase },
      onboarding,
      strategie,
    };
    checkpoints.push(checkpoint);
    await opts.onCheckpoint?.(checkpoint);
  }

  return { transcript, checkpoints, finalCanvas: canvas, phasesRun, stalledPhases };
}
