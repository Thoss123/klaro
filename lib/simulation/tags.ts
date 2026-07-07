/**
 * Pure parsing of the coach's machine-readable control tags out of a completed
 * turn. Mirrors the side-effect detection in app/chat/page.tsx, but as a
 * dependency-free function the driver and unit tests can both call.
 */

import type { Phase } from '@/lib/types';
import { PHASE_ORDER } from './types';
import type { TurnSignals } from './types';

const PHASE_SET = new Set<string>(PHASE_ORDER);

/** Extract the phase named in a `<phase_complete>NAME</phase_complete>` tag. */
export function parsePhaseComplete(text: string): Phase | undefined {
  if (!text) return undefined;
  const m = text.match(/<phase_complete>\s*([a-zA-Z]+)\s*<\/phase_complete>/);
  const name = m?.[1]?.toLowerCase();
  return name && PHASE_SET.has(name) ? (name as Phase) : undefined;
}

/** True if the coach asked the canvas worker to run this turn. */
export function hasCanvasTrigger(text: string): boolean {
  return /trigger_canvas_update/i.test(text || '');
}

/** True if the coach wrote the canvas directly (diagnose data tag). */
export function hasCoachCanvasWrite(text: string): boolean {
  return /<canvas_update>[\s\S]*?<\/canvas_update>/.test(text || '');
}

/** True if the coach emitted a Phase-3 workflow plan this turn. */
export function hasWorkflowPlan(text: string): boolean {
  return /<workflow_plan>[\s\S]*?<\/workflow_plan>/.test(text || '');
}

/** Parse every `<workflow_plan>{…}</workflow_plan>` JSON block (skips broken ones). */
export function parseWorkflowPlans(text: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const m of (text || '').matchAll(/<workflow_plan>([\s\S]*?)<\/workflow_plan>/g)) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      // partial / malformed — ignore, like the client does
    }
  }
  return out;
}

/** Parse the first `<canvas_update>{…}</canvas_update>` block (diagnose). */
export function parseCoachCanvasUpdate(text: string): Record<string, unknown> | null {
  const m = (text || '').match(/<canvas_update>([\s\S]*?)<\/canvas_update>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1].trim());
  } catch {
    return null;
  }
}

/** True if the coach called prepare_phase via tool_call this turn. */
export function hasPreparePhaseToolCall(text: string): boolean {
  return /"type"\s*:\s*"prepare_phase"/.test(text || '');
}

/** True if the coach verbally claims a phase started without the proper tags. */
export function hasVerbalPhaseSwitch(text: string): boolean {
  if (!text) return false;
  const stripped = text.replace(/<phase_complete>[\s\S]*?<\/phase_complete>/gi, '');
  return /phase\s*[123]\s*(startet|aktivier|beginnt)|wir\s+sind\s+jetzt\s+in\s+(phase|der)\s*[12334]/i.test(stripped);
}
/** Collapse a full coach turn into the structured signals the driver acts on. */
export function parseTurnSignals(text: string): TurnSignals {
  return {
    phaseComplete: parsePhaseComplete(text),
    canvasTrigger: hasCanvasTrigger(text),
    workflowPlan: hasWorkflowPlan(text),
    coachCanvasWrite: hasCoachCanvasWrite(text),
  };
}
