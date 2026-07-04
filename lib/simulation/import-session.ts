/**
 * Import a finished simulation run into a REAL chat session for a (test) user,
 * so it can be opened in the normal chat UI at /chat?id=<sessionId> and
 * continued by hand. Uses the service-role client to write the rows; because
 * the session is stamped with the test user's id, RLS lets that user read and
 * keep writing to it once logged in.
 */

import { createSupabaseServiceClient } from '@/lib/supabase';
import type { CanvasData } from '@/lib/types';
import { getRun, loadCheckpoint, getTranscript } from './store';
import { getPersona } from './personas';
import { PHASE_ORDER } from './types';
import type { Phase } from '@/lib/types';

export interface ImportResult {
  sessionId: string;
  projectId: string;
  url: string;
  messageCount: number;
  phase: Phase;
}

export async function importRunToSession(
  runId: string,
  userId: string,
  baseUrl: string,
): Promise<ImportResult> {
  if (!userId) throw new Error('importRunToSession: userId required');
  const db = createSupabaseServiceClient();

  const run = await getRun(runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  const phasesRun = (run.phases_run ?? []) as Phase[];
  const lastPhase: Phase = phasesRun[phasesRun.length - 1] ?? PHASE_ORDER[0];

  const checkpoint = await loadCheckpoint(runId, lastPhase);
  const transcript = await getTranscript(runId);

  const onboarding = (checkpoint?.onboarding ?? {}) as Record<string, unknown>;
  const persona = getPersona(run.persona_slug);
  const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

  // 1. A dedicated project so sim sessions don't pollute real ones.
  const projectName = `🧪 Simulation: ${persona?.label ?? run.persona_slug}`;
  const { data: project, error: projErr } = await db
    .from('projects')
    .insert({ user_id: userId, name: projectName })
    .select('id')
    .single();
  if (projErr || !project) throw new Error(`create project: ${projErr?.message}`);
  const projectId = project.id as string;

  // 2. The session, pre-filled with the persona's onboarding + reached phase.
  const { data: session, error: sessErr } = await db
    .from('sessions')
    .insert({
      project_id: projectId,
      user_id: userId,
      ziel: str(onboarding.ziel),
      ki_erfahrung: str(onboarding.ki_erfahrung),
      wer_setzt_um: str(onboarding.wer_setzt_um),
      hindernis: str(onboarding.hindernis),
      branche: str(onboarding.branche),
      tempo: str(onboarding.tempo),
      unternehmensgroesse: str(onboarding.unternehmensgroesse),
      vorname: str(onboarding.vorname) ?? str(onboarding.username),
      firmenname: str(onboarding.firmenname),
      rolle_im_unternehmen: str(onboarding.rolle_im_unternehmen),
      phase: lastPhase,
      title: `Sim · ${run.persona_slug} · ${phasesRun.join('→') || lastPhase}`,
      welcome_sent: true, // skip the auto-welcome — the transcript already starts the chat
    })
    .select('id')
    .single();
  if (sessErr || !session) throw new Error(`create session: ${sessErr?.message}`);
  const sessionId = session.id as string;

  // 3. The transcript as real messages (customer→user, coach→assistant), keeping
  //    order via staggered created_at timestamps.
  const base = Date.now();
  const rows = transcript.map((t, i) => ({
    session_id: sessionId,
    role: t.role === 'coach' ? 'assistant' : 'user',
    content: t.content,
    created_at: new Date(base + i * 1000).toISOString(),
  }));
  if (rows.length) {
    const { error: msgErr } = await db.from('messages').insert(rows);
    if (msgErr) throw new Error(`insert messages: ${msgErr.message}`);
  }

  // 4. Session + project canvas so the canvas panel matches where the chat left off.
  const canvas: CanvasData = (checkpoint?.canvas as CanvasData)
    ?? { pain_points: [], use_cases: [], workflows: [], documents: [], phase: lastPhase };
  await db.from('canvas').insert({ session_id: sessionId, data: canvas });
  await db.from('project_canvas').insert({ project_id: projectId, data: canvas });

  return {
    sessionId,
    projectId,
    url: `${baseUrl}/chat?id=${sessionId}`,
    messageCount: rows.length,
    phase: lastPhase,
  };
}
