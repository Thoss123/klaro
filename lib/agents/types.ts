/**
 * Shared types for the Sprint 3 agent-orchestration pipeline.
 *
 * The pipeline runs three background "Small"-model agents before the Canvas
 * Worker extracts JSON, so canvas quality (single topic, one workflow per pain
 * point, full automation, correct order) is enforced technically rather than
 * left to the coach prompt alone.
 */

import type { WorkflowStep } from '@/lib/types';

/** Minimal chat message shape the agents reason over. */
export interface AgentMessage {
  role: string;
  content: string;
}

/** Generic agent envelope — every agent degrades gracefully on error. */
export interface AgentResult<T> {
  ok: boolean;
  data: T;
  error?: string;
  /** Approximate tokens the underlying model call consumed (for the DevContext cost view). */
  tokens?: number;
}

/** Topic Research Agent (Phase `plan`, optional). */
export interface ResearchBrief {
  /** Whether research was skipped (topic needs no external recherche). */
  skip: boolean;
  /** Short factual bullets the worker may fold into the workflow. */
  bullets: string[];
  /** Hints at where the info would come from (YouTube, web, tool docs…). */
  sources_hint: string[];
  /** Open questions the coach may still need to clarify. */
  open_questions: string[];
}

/** Supervisor Agent — alignment gate. */
export type SupervisorVerdict = 'approved' | 'revise_coach' | 'block';

export interface SupervisorResult {
  verdict: SupervisorVerdict;
  /** The single topic the current chat slice is about. */
  active_topic: string;
  /** Exact pain_point id the workflow should attach to (or null if unclear). */
  target_pain_point: string | null;
  /** True → update the existing workflow for that pain point instead of a new one. */
  merge_with_existing: boolean;
  /** Hard instruction the Canvas Worker must follow when extracting. */
  instruction_for_worker: string;
  /** Internal-only nudge for the next coach turn (never streamed to the user). */
  coach_hint?: string;
}

/** Workflow QA Agent (Critic). */
export interface WorkflowQAResult {
  status: 'pass' | 'fail';
  /** Human-readable problems found (chronology, over-manual steps, long title…). */
  issues: string[];
  /** Optional corrected step list the worker must adopt verbatim. */
  fixed_steps?: WorkflowStep[];
  notes: string;
}

/** One structured log line emitted per pipeline step. */
export interface PipelineLogEntry {
  step: 'research' | 'supervisor' | 'workflow-qa' | 'pipeline';
  ok: boolean;
  detail: string;
  tokens?: number;
}

/** Full result handed back to the Canvas Worker. */
export interface PipelineResult {
  /** False when the pipeline short-circuited (phase ≠ plan, or blocked). */
  ran: boolean;
  /** When false, the Canvas Worker must NOT extract (supervisor blocked/revise). */
  proceed: boolean;
  supervisor?: SupervisorResult;
  research?: ResearchBrief;
  qa?: WorkflowQAResult;
  /** Combined instruction block injected into the worker extraction prompt. */
  workerDirective: string;
  logs: PipelineLogEntry[];
  /** Sum of all agent token estimates. */
  totalTokens: number;
}
