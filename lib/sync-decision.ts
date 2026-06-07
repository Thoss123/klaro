import { isHiddenSystemMessage } from '@/lib/hidden-chat';

/** Structured terminal logging for canvas + memory sync after each chat turn. */

export type SyncChannel = 'canvas' | 'memory';

export type CanvasSkipReason =
  | 'hidden_init'
  | 'no_project_id'
  | 'worker_already_running'
  | 'thin_user_context'
  | 'tag_seen_but_blocked'
  | 'no_trigger_and_auto_sync_off'
  | 'insufficient_context'
  | 'no_api_key'
  | 'invalid_json'
  | 'db_save_failed'
  | 'network_error'
  | 'plan_awaiting_workflow_chat'
  | 'orchestration_deferred'
  | 'umsetzung_no_worker'
  | 'unknown';

export type MemorySkipReason =
  | 'hidden_init'
  | 'empty_assistant'
  | 'missing_params'
  | 'no_api_key'
  | 'no_new_facts'
  | 'db_save_failed'
  | 'network_error'
  | 'unknown';

export function logSync(
  channel: SyncChannel,
  event: 'turn' | 'evaluate' | 'invoke' | 'skip' | 'success' | 'fail',
  message: string,
  meta?: Record<string, unknown>
): void {
  const payload = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[agent-sync][${channel}][${event}] ${message}${payload}`);
}

const WELCOME_ONLY = /^Hallo,?\s*lass uns starten!?$/i;

/** Whether canvas worker may run for this turn (client-side). */
export function evaluateCanvasEligibility(params: {
  isHiddenInit: boolean;
  projectId?: string | null;
  phase: string;
  userMessages: { role: string; content: string }[];
  workerAlreadyScheduled: boolean;
}): { eligible: boolean; reason: CanvasSkipReason | 'ok'; detail: string } {
  const { isHiddenInit, projectId, phase, userMessages, workerAlreadyScheduled } = params;

  if (isHiddenInit) {
    return { eligible: false, reason: 'hidden_init', detail: 'Welcome/hidden init — no sync' };
  }
  if (!projectId) {
    return { eligible: false, reason: 'no_project_id', detail: 'Session has no project_id' };
  }
  if (workerAlreadyScheduled) {
    return { eligible: false, reason: 'worker_already_running', detail: 'Canvas worker already scheduled this turn' };
  }

  const userLines = userMessages
    .filter(m => m.role === 'user')
    .map(m => (m.content || '').trim())
    .filter(line => line.length > 0 && !isHiddenSystemMessage(line));

  const userText = userLines.join(' ');
  const chars = userText.length;

  if (phase === 'umsetzung') {
    // Phase 4: Canvas wird ausschließlich durch build_workflow (Server) gepflegt.
    // Kein Canvas-Worker (würde die frisch gebaute Deploy-Karte überschreiben) und
    // KEINE "kein Kontext"-Coach-Meldung (coach-status liefert für umsetzung null).
    return { eligible: false, reason: 'umsetzung_no_worker', detail: 'phase=umsetzung — canvas via build_workflow only' };
  }

  if (phase === 'plan' && chars < 40) {
    return {
      eligible: false,
      reason: 'plan_awaiting_workflow_chat',
      detail: 'Plan: erst nach sichtbarem Nutzer-Input zum Workflow (kein Kickoff allein)',
    };
  }

  if (chars < 40) {
    return {
      eligible: false,
      reason: 'thin_user_context',
      detail: `User text only ${chars} chars (need ≥40)`,
    };
  }

  if (phase === 'diagnose') {
    const onlyWelcome =
      userLines.length > 0 &&
      userLines.every(
        line =>
          WELCOME_ONLY.test(line) ||
          /^Starte Phase \d/i.test(line)
      );
    if (onlyWelcome && !userLines.some(line => line.length > 80)) {
      return {
        eligible: false,
        reason: 'thin_user_context',
        detail: 'Diagnose: only welcome/phase-kickoff, no substantive user facts',
      };
    }
  }

  return { eligible: true, reason: 'ok', detail: `phase=${phase}, userChars=${chars}` };
}

/** Server-side mirror of canvas eligibility (history includes hidden init user line). */
export function evaluateHistoryForCanvas(
  phase: string,
  history: { role: string; content: string }[]
): { ok: boolean; reason: string; detail: string } {
  const r = evaluateCanvasEligibility({
    isHiddenInit: false,
    projectId: 'ok',
    phase,
    userMessages: history,
    workerAlreadyScheduled: false,
  });
  if (r.eligible) return { ok: true, reason: 'ok', detail: r.detail };
  return { ok: false, reason: r.reason, detail: r.detail };
}

export function summarizeCanvasDiff(
  before: { pain_points?: unknown[]; company?: Record<string, unknown>; use_cases?: unknown[] },
  after: { pain_points?: unknown[]; company?: Record<string, unknown>; use_cases?: unknown[] }
): string {
  const beforePp = before.pain_points?.length ?? 0;
  const afterPp = after.pain_points?.length ?? 0;
  const dPp = afterPp - beforePp;
  const beforeUc = before.use_cases?.length ?? 0;
  const afterUc = after.use_cases?.length ?? 0;
  const dUc = afterUc - beforeUc;
  const steps = (after.company?.process_steps as string[] | undefined)?.length ?? 0;
  const appetite = (after.company?.change_appetite as string | undefined) || '—';
  return `pain_points ${beforePp}→${afterPp} (Δ${dPp >= 0 ? '+' : ''}${dPp}), use_cases ${beforeUc}→${afterUc} (Δ${dUc >= 0 ? '+' : ''}${dUc}), company_steps=${steps}, change_appetite=${appetite}`;
}

/** Nutzerfreundliche Kurzbeschreibung für Canvas-Skip-Gründe (Agent-Feed). */
export function canvasSkipUserLabel(reason: string | undefined, detail?: string): string {
  switch (reason) {
    case 'plan_awaiting_workflow_chat':
      return 'Workflow-Canvas wartet auf euer Gespräch in Phase 3';
    case 'orchestration_deferred':
    case 'orchestration_blocked':
      return 'Noch kein konkreter Workflow im Chat — Plan folgt nach der Besprechung';
    case 'insufficient_context':
      return `Kontext: ${detail || 'zu wenig'}`;
    case 'missing_project_id':
      return 'kein Projekt';
    case 'thin_user_context':
      return 'noch zu wenig Gesprächsinhalt';
    default:
      return reason || 'übersprungen';
  }
}
