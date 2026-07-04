/**
 * Orchestrator. Two entry points that match the actual roles:
 *
 *  simulateRun()   — runs the Mistral customer against the real coach, computes
 *                    the deterministic mechanical findings, persists everything,
 *                    and returns a JudgePacket for Claude Code to judge.
 *  recordJudgment() — takes Claude Code's rubric verdicts, combines them with the
 *                    mechanical findings, scores the run and finalizes it.
 */

import type { Phase } from '@/lib/types';
import { runSimulation } from './driver';
import {
  finalizeVerdict,
  mechanicalFindings,
  normalizeRubricVerdicts,
  rubricRuleSpecs,
} from './judge';
import { getPersona } from './personas';
import { PERSONA_MODEL } from './llm';
import {
  createRun,
  finishRun,
  getFindings,
  getRun,
  loadCheckpoint,
  saveCheckpoints,
  saveFindings,
  saveTranscript,
  setRunAwaitingJudge,
} from './store';
import type { JudgePacket, RubricVerdictInput, RunVerdict } from './types';

export interface SimulateRunInput {
  personaSlug: string;
  label?: string;
  phases?: Phase[];
  resume?: { runId: string; afterPhase: Phase };
  baseUrl: string;
  maxTurnsPerPhase?: number;
}

/** Step 1 — Mistral simulates + mechanical judging. Returns the packet for Claude. */
export async function simulateRun(input: SimulateRunInput): Promise<JudgePacket> {
  const persona = getPersona(input.personaSlug);
  if (!persona) throw new Error(`Unknown persona "${input.personaSlug}"`);

  const runId = await createRun({
    personaSlug: persona.slug,
    label: input.label,
    resumedFromRunId: input.resume?.runId,
    resumedFromPhase: input.resume?.afterPhase,
    coachModel: 'mistral (via /api/chat)',
    judgeModel: `Claude Code / Opus (persona: ${PERSONA_MODEL})`,
  });

  try {
    const seed = input.resume
      ? await loadCheckpoint(input.resume.runId, input.resume.afterPhase)
      : undefined;
    if (input.resume && !seed) {
      throw new Error(`No checkpoint for run ${input.resume.runId} at phase "${input.resume.afterPhase}".`);
    }

    // Persist incrementally: under flaky providers a run can die mid-phase, and
    // we still want whatever transcript/checkpoints were captured to survive so
    // the partial run is judgeable.
    const sim = await runSimulation(
      {
        persona,
        phases: input.phases,
        baseUrl: input.baseUrl,
        maxTurnsPerPhase: input.maxTurnsPerPhase,
        onTurn: (turn) => saveTranscript(runId, [turn]),
        onCheckpoint: (cp) => saveCheckpoints(runId, [cp]),
      },
      seed ?? undefined,
    );

    const mechanical = mechanicalFindings({
      persona,
      transcript: sim.transcript,
      canvas: sim.finalCanvas,
      phasesRun: sim.phasesRun,
      stalledPhases: sim.stalledPhases,
    });

    await saveFindings(runId, mechanical);
    await setRunAwaitingJudge(runId, sim.phasesRun);

    return {
      runId,
      personaSlug: persona.slug,
      onboarding: persona.onboarding,
      groundTruth: persona.groundTruth,
      phasesRun: sim.phasesRun,
      stalledPhases: sim.stalledPhases,
      rubricRules: rubricRuleSpecs(),
      mechanicalFindings: mechanical,
      transcript: sim.transcript,
    };
  } catch (e) {
    await finishRun(runId, { status: 'failed', error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** Step 2 — record Claude Code's rubric verdicts and finalize the run. */
export async function recordJudgment(
  runId: string,
  verdicts: RubricVerdictInput[],
): Promise<{ verdict: RunVerdict; failedFindings: number }> {
  const run = await getRun(runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  // Mechanical findings were already persisted in step 1.
  const existing = await getFindings(runId);
  const mechanical = existing.filter(f => f.kind === 'mechanical');
  const rubric = normalizeRubricVerdicts(verdicts);

  const { findings, verdict } = finalizeVerdict(mechanical, rubric);
  await saveFindings(runId, rubric); // append the rubric findings
  await finishRun(runId, { status: 'done', verdict });

  return { verdict, failedFindings: findings.filter(f => !f.passed).length };
}
