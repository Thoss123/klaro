/**
 * Supabase persistence for the harness. Uses the service-role client (bypasses
 * RLS on the dev-only sim_* tables). All reads/writes for runs, transcript,
 * checkpoints, findings, personas and improvements live here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceClient } from '@/lib/supabase';
import type { CanvasData, Phase } from '@/lib/types';
import type {
  Finding,
  PhaseCheckpoint,
  RunVerdict,
  SimMessage,
  TranscriptTurn,
} from './types';
import { SEED_PERSONAS } from './personas';

function db(): SupabaseClient {
  return createSupabaseServiceClient();
}

// ── personas ─────────────────────────────────────────────────────────────────

export async function seedPersonas(): Promise<number> {
  const rows = SEED_PERSONAS.map(p => ({
    slug: p.slug,
    label: p.label,
    onboarding: p.onboarding,
    behavior: p.behavior,
    ground_truth: p.groundTruth,
    active: true,
  }));
  const { error } = await db().from('sim_personas').upsert(rows, { onConflict: 'slug' });
  if (error) throw new Error(`seedPersonas: ${error.message}`);
  return rows.length;
}

export async function listPersonas(): Promise<Array<{ slug: string; label: string }>> {
  const { data, error } = await db()
    .from('sim_personas')
    .select('slug,label')
    .eq('active', true)
    .order('slug');
  if (error) throw new Error(`listPersonas: ${error.message}`);
  return data ?? [];
}

// ── runs ─────────────────────────────────────────────────────────────────────

export interface RunRow {
  id: string;
  persona_slug: string;
  label: string | null;
  status: string;
  phases_run: string[];
  resumed_from_run_id: string | null;
  resumed_from_phase: string | null;
  coach_model: string | null;
  judge_model: string | null;
  verdict: RunVerdict | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export async function createRun(input: {
  personaId?: string;
  personaSlug: string;
  label?: string;
  resumedFromRunId?: string;
  resumedFromPhase?: Phase;
  coachModel?: string;
  judgeModel?: string;
}): Promise<string> {
  const { data, error } = await db()
    .from('sim_runs')
    .insert({
      persona_id: input.personaId ?? null,
      persona_slug: input.personaSlug,
      label: input.label ?? null,
      status: 'running',
      resumed_from_run_id: input.resumedFromRunId ?? null,
      resumed_from_phase: input.resumedFromPhase ?? null,
      coach_model: input.coachModel ?? null,
      judge_model: input.judgeModel ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createRun: ${error?.message}`);
  return data.id as string;
}

/** Mistral simulation done, mechanical findings saved — waiting for Claude Code's verdict. */
export async function setRunAwaitingJudge(runId: string, phasesRun: Phase[]): Promise<void> {
  const { error } = await db()
    .from('sim_runs')
    .update({ status: 'awaiting_judge', phases_run: phasesRun })
    .eq('id', runId);
  if (error) throw new Error(`setRunAwaitingJudge: ${error.message}`);
}

export async function finishRun(
  runId: string,
  patch: { status: 'done' | 'failed'; phasesRun?: Phase[]; verdict?: RunVerdict; error?: string },
): Promise<void> {
  const update: Record<string, unknown> = {
    status: patch.status,
    verdict: patch.verdict ?? null,
    error: patch.error ?? null,
    finished_at: new Date().toISOString(),
  };
  // Only set phases_run when provided, so finalizing a judged run doesn't wipe
  // the phases recorded at the awaiting_judge step.
  if (patch.phasesRun) update.phases_run = patch.phasesRun;
  const { error } = await db().from('sim_runs').update(update).eq('id', runId);
  if (error) throw new Error(`finishRun: ${error.message}`);
}

export async function listRuns(limit = 50): Promise<RunRow[]> {
  const { data, error } = await db()
    .from('sim_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRuns: ${error.message}`);
  return (data ?? []) as RunRow[];
}

export async function getRun(runId: string): Promise<RunRow | null> {
  const { data, error } = await db().from('sim_runs').select('*').eq('id', runId).maybeSingle();
  if (error) throw new Error(`getRun: ${error.message}`);
  return (data as RunRow) ?? null;
}

// ── transcript + checkpoints + findings ──────────────────────────────────────

export async function saveTranscript(runId: string, turns: TranscriptTurn[]): Promise<void> {
  if (!turns.length) return;
  const rows = turns.map(t => ({
    run_id: runId,
    turn: t.turn,
    phase: t.phase,
    role: t.role,
    content: t.content,
    raw: t.raw ?? null,
    signals: t.signals,
  }));
  const { error } = await db().from('sim_messages').insert(rows);
  if (error) throw new Error(`saveTranscript: ${error.message}`);
}

export async function getTranscript(runId: string): Promise<TranscriptTurn[]> {
  const { data, error } = await db()
    .from('sim_messages')
    .select('turn,phase,role,content,raw,signals')
    .eq('run_id', runId)
    .order('turn');
  if (error) throw new Error(`getTranscript: ${error.message}`);
  return (data ?? []).map(r => ({
    turn: r.turn as number,
    phase: r.phase as Phase,
    role: r.role as 'customer' | 'coach',
    content: r.content as string,
    raw: (r.raw as string) ?? undefined,
    signals: (r.signals as TranscriptTurn['signals']) ?? {},
  }));
}

export async function saveCheckpoints(runId: string, checkpoints: PhaseCheckpoint[]): Promise<void> {
  if (!checkpoints.length) return;
  const rows = checkpoints.map(c => ({
    run_id: runId,
    phase: c.phase,
    messages: c.messages,
    canvas: c.canvas,
    onboarding: c.onboarding,
  }));
  const { error } = await db().from('sim_checkpoints').upsert(rows, { onConflict: 'run_id,phase' });
  if (error) throw new Error(`saveCheckpoints: ${error.message}`);
}

export async function loadCheckpoint(runId: string, phase: Phase): Promise<PhaseCheckpoint | null> {
  const { data, error } = await db()
    .from('sim_checkpoints')
    .select('phase,messages,canvas,onboarding')
    .eq('run_id', runId)
    .eq('phase', phase)
    .maybeSingle();
  if (error) throw new Error(`loadCheckpoint: ${error.message}`);
  if (!data) return null;
  return {
    phase: data.phase as Phase,
    messages: data.messages as SimMessage[],
    canvas: data.canvas as CanvasData,
    onboarding: data.onboarding as Record<string, unknown>,
  };
}

export async function saveFindings(runId: string, findings: Finding[]): Promise<void> {
  if (!findings.length) return;
  const rows = findings.map(f => ({
    run_id: runId,
    rule_id: f.ruleId,
    kind: f.kind,
    phase: f.phase ?? null,
    passed: f.passed,
    severity: f.severity,
    message: f.message,
    evidence: f.evidence ?? null,
    suggested_fix: f.suggestedFix ?? null,
  }));
  const { error } = await db().from('sim_findings').insert(rows);
  if (error) throw new Error(`saveFindings: ${error.message}`);
}

export async function getFindings(runId: string): Promise<Finding[]> {
  const { data, error } = await db()
    .from('sim_findings')
    .select('rule_id,kind,phase,passed,severity,message,evidence,suggested_fix')
    .eq('run_id', runId);
  if (error) throw new Error(`getFindings: ${error.message}`);
  return (data ?? []).map(r => ({
    ruleId: r.rule_id as string,
    kind: r.kind as Finding['kind'],
    phase: (r.phase as Phase) ?? undefined,
    passed: r.passed as boolean,
    severity: r.severity as Finding['severity'],
    message: r.message as string,
    evidence: (r.evidence as string) ?? undefined,
    suggestedFix: (r.suggested_fix as string) ?? undefined,
  }));
}

// ── improvements ─────────────────────────────────────────────────────────────

export interface ImprovementRow {
  id: string;
  rule_id: string;
  title: string;
  target_prompt: string;
  fail_count: number;
  run_count: number;
  example_quotes: string[];
  proposed_change: string;
  status: string;
  verified_by_run_id: string | null;
  verification_note: string | null;
  created_at: string;
  updated_at: string;
}

export async function upsertImprovements(
  rows: Array<Omit<ImprovementRow, 'id' | 'created_at' | 'updated_at' | 'status' | 'verified_by_run_id' | 'verification_note'>>,
): Promise<void> {
  if (!rows.length) return;
  const payload = rows.map(r => ({ ...r, updated_at: new Date().toISOString() }));
  const { error } = await db().from('sim_improvements').insert(payload);
  if (error) throw new Error(`upsertImprovements: ${error.message}`);
}

export async function listImprovements(): Promise<ImprovementRow[]> {
  const { data, error } = await db()
    .from('sim_improvements')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`listImprovements: ${error.message}`);
  return (data ?? []) as ImprovementRow[];
}

export async function markImprovement(
  id: string,
  patch: { status: string; verifiedByRunId?: string; verificationNote?: string },
): Promise<void> {
  const { error } = await db()
    .from('sim_improvements')
    .update({
      status: patch.status,
      verified_by_run_id: patch.verifiedByRunId ?? null,
      verification_note: patch.verificationNote ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`markImprovement: ${error.message}`);
}
