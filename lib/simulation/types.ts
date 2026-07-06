/**
 * Simulation harness — shared types.
 *
 * The harness drives a synthetic customer (an LLM persona) against the real
 * coach (`/api/chat`), judges the result, persists everything to Supabase and
 * feeds findings into a self-improvement loop. See lib/simulation/README.md.
 */

import type { CanvasData, OnboardingData, Phase } from '@/lib/types';

export const PHASE_ORDER: Phase[] = ['diagnose', 'analyse', 'umsetzung'];

/** A chat message in the shape `/api/chat` expects. */
export interface SimMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Behaviour knobs for the persona LLM — what makes a customer *realistic*. */
export interface PersonaBehavior {
  /** 0 = crisp answers, 1 = vague, rambling, omits numbers unless pushed. */
  vagueness?: number;
  /** 0 = follows the coach, 1 = goes off-topic / tells stories. */
  tangents?: number;
  /** 0 = trusting, 1 = pushes back hard on cost and effort. */
  skepticism?: number;
  /** 0 = non-technical (no tool names), 1 = names tools/APIs precisely. */
  techLiteracy?: number;
  /** Free-text persona quirks injected into the simulator system prompt. */
  notes?: string;
}

/** What a run *should* produce — lets the judge check coverage, not just style. */
export interface PersonaGroundTruth {
  /** Pain points the coach ought to surface (free-text, matched loosely). */
  expectedPainPoints?: string[];
  /** Tools the customer actually uses (Phase 2 should capture these). */
  toolsInUse?: string[];
  /** Automations that are genuinely realistic for this customer. */
  realisticAutomations?: string[];
  /** Ideas that are NOT practical — the coach should filter these out. */
  impracticalIdeas?: string[];
}

export interface Persona {
  slug: string;
  label: string;
  onboarding: Partial<OnboardingData> & Record<string, unknown>;
  behavior: PersonaBehavior;
  groundTruth: PersonaGroundTruth;
}

export type FindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type FindingKind = 'mechanical' | 'rubric';

export interface Finding {
  ruleId: string;
  kind: FindingKind;
  phase?: Phase;
  passed: boolean;
  severity: FindingSeverity;
  message: string;
  evidence?: string;
  suggestedFix?: string;
}

/** Snapshot of conversation state at the end of a phase (the resume backbone). */
export interface PhaseCheckpoint {
  phase: Phase;
  messages: SimMessage[];
  canvas: CanvasData;
  onboarding: Record<string, unknown>;
  /** Interne Strategie dieses Laufs (damit ein Resume ohne Neugenerierung fortsetzt). */
  strategie?: string | null;
}

/** One turn of the driven conversation, captured for transcript + judging. */
export interface TranscriptTurn {
  turn: number;
  phase: Phase;
  role: 'customer' | 'coach';
  /** User-visible content (coach content has internal tags stripped). */
  content: string;
  /** Raw coach output incl. tags (undefined for customer turns). */
  raw?: string;
  signals: TurnSignals;
}

/** Machine-readable side-effects parsed from a coach turn. */
export interface TurnSignals {
  /** Phase the coach declared complete this turn, if any. */
  phaseComplete?: Phase;
  /** Coach asked the worker to update the canvas this turn. */
  canvasTrigger?: boolean;
  /** Coach emitted a <workflow_plan> this turn. */
  workflowPlan?: boolean;
  /** Coach wrote the canvas directly (diagnose <canvas_update>). */
  coachCanvasWrite?: boolean;
}

export interface RunResult {
  runId: string;
  personaSlug: string;
  phasesRun: Phase[];
  transcript: TranscriptTurn[];
  checkpoints: PhaseCheckpoint[];
  findings: Finding[];
  verdict: RunVerdict;
  finalCanvas: CanvasData;
}

export interface RunVerdict {
  /** 0–100, weighted by severity of failed findings. */
  score: number;
  pass: boolean;
  bySeverity: Record<FindingSeverity, number>;
  /** ruleId → failed? for quick before/after diffing in the improve loop. */
  byRule: Record<string, boolean>;
}

/** A rubric rule handed to Claude Code (the judge) to evaluate. */
export interface RubricRuleSpec {
  id: string;
  title: string;
  severity: FindingSeverity;
  targetPrompt: string;
  guidance: string;
}

/**
 * Everything Claude Code needs to judge a run. The code produces this after the
 * Mistral simulation finishes (mechanical findings are already computed); Claude
 * Code reads it, applies the rubric rules to the transcript, and posts back a
 * verdict via recordJudgment.
 */
export interface JudgePacket {
  runId: string;
  personaSlug: string;
  onboarding: Record<string, unknown>;
  groundTruth: PersonaGroundTruth;
  phasesRun: Phase[];
  stalledPhases: Phase[];
  /** The rubric rules to judge (source of truth: rules.ts). */
  rubricRules: RubricRuleSpec[];
  /** Deterministic findings already decided by code. */
  mechanicalFindings: Finding[];
  transcript: TranscriptTurn[];
}

/** One rubric verdict Claude Code returns per rule. */
export interface RubricVerdictInput {
  ruleId: string;
  passed: boolean;
  severity?: FindingSeverity;
  message: string;
  evidence?: string;
  suggestedFix?: string;
}

/** Options for a single driver run. */
export interface DriverOptions {
  persona: Persona;
  /** Phases to actually simulate this run (default: all four). */
  phases?: Phase[];
  /** Resume: prior run id + the phase whose checkpoint to start AFTER. */
  resume?: { runId: string; afterPhase: Phase };
  /** Base URL of the running app (driver POSTs to `${baseUrl}/api/chat`). */
  baseUrl: string;
  /** Hard cap on coach turns per phase, so a stuck phase can't loop forever. */
  maxTurnsPerPhase?: number;
  /**
   * Called as each turn is produced, so a caller can persist incrementally —
   * under flaky providers a run can die mid-phase, and we still want the
   * transcript captured so far to be judgeable.
   */
  onTurn?: (turn: TranscriptTurn) => Promise<void> | void;
  /** Called when a phase checkpoint is snapshotted. */
  onCheckpoint?: (checkpoint: PhaseCheckpoint) => Promise<void> | void;
  /** Called once after the internal strategy is generated (null = ran without one). */
  onStrategy?: (strategie: string | null) => Promise<void> | void;
}
