/**
 * DEV — assemble a full chat dump for AI debugging (strategy, research, tool calls, canvas).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildInjectedSystemPrompt, estimatePromptTokens } from '@/lib/dev/build-injected-prompt';
import { toExportedMessage } from '@/lib/dev/parse-message-tags';
import { isCoachV2Enabled } from '@/lib/coach/assemble';
import { normalizePhase } from '@/lib/phases';
import type { CanvasData, OnboardingData } from '@/lib/types';

export const CHAT_EXPORT_FORMAT_VERSION = '1';

export type ChatExportPayload = {
  format_version: string;
  exported_at: string;
  instructions_for_ai: string;
  session: Record<string, unknown>;
  project: Record<string, unknown> | null;
  onboarding: Partial<OnboardingData> & Record<string, unknown>;
  context: {
    phase: string;
    coach_v2: boolean;
    model: string;
    context_limit: number;
    system_prompt: string;
    tokens: {
      system: number;
      history: number;
      total: number;
      pct: number;
      remaining: number;
    };
    memory_injected: string;
  };
  messages: ReturnType<typeof toExportedMessage>[];
  session_memory: string | null;
  project_memory: Array<{ phase: string; summary: string; created_at: string | null }>;
  canvas: CanvasData | null;
  session_canvas: CanvasData | null;
  project_sessions: Array<Record<string, unknown>>;
  deployed_workflows: Array<Record<string, unknown>>;
  summary: {
    message_count: number;
    user_messages: number;
    assistant_messages: number;
    tool_call_count: number;
    canvas_update_count: number;
    workflow_plan_count: number;
    phase_complete_events: number;
  };
};

const MODEL_CONTEXT_LIMIT = 128_000;

function sessionToOnboarding(session: Record<string, unknown>): Partial<OnboardingData> & Record<string, unknown> {
  return {
    ziel: session.ziel as string | undefined,
    ki_erfahrung: session.ki_erfahrung as string | undefined,
    wer_setzt_um: session.wer_setzt_um as string | undefined,
    hindernis: session.hindernis as string | undefined,
    branche: session.branche as string | undefined,
    tempo: session.tempo as string | undefined,
    unternehmensgroesse: session.unternehmensgroesse as string | undefined,
    technik_level: session.technik_level as string | undefined,
    vorname: session.vorname as string | undefined,
    firmenname: session.firmenname as string | undefined,
    rolle_im_unternehmen: session.rolle_im_unternehmen as string | undefined,
    firmen_website: session.firmen_website as string | undefined,
    firmen_recherche: session.firmen_recherche as string | undefined,
    memory: session.memory as string | undefined,
  };
}

function buildMemoryInjected(sessionMemory: string | null, projectMemoryRows: Array<{ phase: string; summary: string }>): string {
  const parts: string[] = [];
  if (sessionMemory?.trim()) {
    parts.push(`--- AKTUELLER SESSION-KONTEXT ---\n${sessionMemory.trim()}`);
  }
  if (projectMemoryRows.length) {
    const cross = projectMemoryRows
      .map(r => `### Phase ${r.phase}\n${r.summary}`)
      .join('\n\n');
    parts.push(`--- PROJEKT-GEDÄCHTNIS (vorherige Phasen) ---\n${cross}`);
  }
  return parts.join('\n\n') || 'Bisher keine Historie.';
}

export async function buildChatExport(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<ChatExportPayload> {
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    throw new Error('Session not found');
  }
  if (session.user_id !== userId) {
    throw new Error('Forbidden');
  }

  const projectId = session.project_id as string | null;
  const phase = normalizePhase(session.phase);

  const [
    messagesRes,
    projectRes,
    projectCanvasRes,
    sessionCanvasRes,
    projectMemoryRes,
    projectSessionsRes,
    workflowsRes,
  ] = await Promise.all([
    supabase
      .from('messages')
      .select('id, role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true }),
    projectId
      ? supabase
          .from('projects')
          .select('id, name, strategy, strategy_updated_at, created_at, updated_at')
          .eq('id', projectId)
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    projectId
      ? supabase.from('project_canvas').select('data, updated_at').eq('project_id', projectId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('canvas').select('data, updated_at').eq('session_id', sessionId).maybeSingle(),
    projectId
      ? supabase
          .from('project_memory')
          .select('phase, summary, created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    projectId
      ? supabase
          .from('sessions')
          .select('id, title, phase, created_at, updated_at, welcome_sent')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    projectId
      ? supabase
          .from('workflows')
          .select('id, name, n8n_workflow_id, status, canvas_workflow_id, created_at, updated_at')
          .eq('project_id', projectId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (projectRes.error) throw new Error(projectRes.error.message);
  if (messagesRes.error) throw new Error(messagesRes.error.message);

  const onboarding = sessionToOnboarding(session as Record<string, unknown>);
  const canvas = (projectCanvasRes.data?.data as CanvasData | undefined) ?? null;
  const sessionCanvas = (sessionCanvasRes.data?.data as CanvasData | undefined) ?? null;
  const projectMemoryRows = (projectMemoryRes.data ?? []) as Array<{ phase: string; summary: string; created_at: string | null }>;
  const sessionMemory = (session.memory as string | null) ?? null;
  const memoryInjected = buildMemoryInjected(sessionMemory, projectMemoryRows);
  const strategie = (projectRes.data?.strategy as string | null) ?? null;

  const systemPrompt = buildInjectedSystemPrompt({
    phase,
    onboarding,
    canvas,
    strategie,
    memoryText: memoryInjected,
  });

  const exportedMessages = (messagesRes.data ?? []).map(toExportedMessage);
  const historyText = exportedMessages.map(m => m.content_visible).join('\n');
  const systemTokens = estimatePromptTokens(systemPrompt);
  const historyTokens = estimatePromptTokens(historyText);
  const totalTokens = systemTokens + historyTokens;

  let toolCallCount = 0;
  let canvasUpdateCount = 0;
  let workflowPlanCount = 0;
  let phaseCompleteEvents = 0;
  for (const m of exportedMessages) {
    toolCallCount += m.parsed.tool_calls.length;
    canvasUpdateCount += m.parsed.canvas_updates.length;
    workflowPlanCount += m.parsed.workflow_plans.length;
    phaseCompleteEvents += m.parsed.phase_complete.length;
  }

  const { user_id: _uid, ...sessionPublic } = session as Record<string, unknown>;

  return {
    format_version: CHAT_EXPORT_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    instructions_for_ai: [
      'Axantilo Chat Debug Export — für KI-Analyse und Debugging.',
      '',
      'Wichtige Felder:',
      '- `context.system_prompt`: vollständiger System-Prompt wie an /api/chat gesendet',
      '- `project.strategy`: interne Gesprächsstrategie (nie nutzer-sichtbar)',
      '- `onboarding.firmen_recherche` / `firmen_website`: automatische Firmen-Recherche',
      '- `messages[].content_raw`: unveränderte DB-Inhalte inkl. XML-Tags',
      '- `messages[].parsed`: extrahierte tool_call, canvas_update, workflow_plan, phase_complete, …',
      '- `canvas`: aktueller project_canvas-Stand (Roadmap)',
      '- `session_memory` / `project_memory`: extrahierte Fakten aus dem Gespräch',
      '',
      'Nutzer-sichtbarer Text steht in `content_visible` (Tags entfernt).',
    ].join('\n'),
    session: sessionPublic,
    project: projectRes.data
      ? {
          id: projectRes.data.id,
          name: projectRes.data.name,
          strategy: projectRes.data.strategy,
          strategy_updated_at: projectRes.data.strategy_updated_at,
          created_at: projectRes.data.created_at,
          updated_at: projectRes.data.updated_at,
        }
      : null,
    onboarding,
    context: {
      phase,
      coach_v2: isCoachV2Enabled(),
      model: phase === 'diagnose'
        ? (process.env.MISTRAL_DIAGNOSE_MODEL || 'mistral-large-latest')
        : (process.env.MISTRAL_CHAT_MODEL || 'mistral-medium-latest'),
      context_limit: MODEL_CONTEXT_LIMIT,
      system_prompt: systemPrompt,
      tokens: {
        system: systemTokens,
        history: historyTokens,
        total: totalTokens,
        pct: Math.round((totalTokens / MODEL_CONTEXT_LIMIT) * 100),
        remaining: MODEL_CONTEXT_LIMIT - totalTokens,
      },
      memory_injected: memoryInjected,
    },
    messages: exportedMessages,
    session_memory: sessionMemory,
    project_memory: projectMemoryRows,
    canvas,
    session_canvas: sessionCanvas,
    project_sessions: (projectSessionsRes.data ?? []) as Array<Record<string, unknown>>,
    deployed_workflows: (workflowsRes.data ?? []) as Array<Record<string, unknown>>,
    summary: {
      message_count: exportedMessages.length,
      user_messages: exportedMessages.filter(m => m.role === 'user').length,
      assistant_messages: exportedMessages.filter(m => m.role === 'assistant').length,
      tool_call_count: toolCallCount,
      canvas_update_count: canvasUpdateCount,
      workflow_plan_count: workflowPlanCount,
      phase_complete_events: phaseCompleteEvents,
    },
  };
}
