/**
 * DEV ONLY — returns the fully-built context (system prompt + history)
 * exactly as it would be sent to the model, plus a token estimate.
 */
import { NextRequest, NextResponse } from 'next/server';
import { buildInjectedSystemPrompt, estimatePromptTokens } from '@/lib/dev/build-injected-prompt';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { CanvasData, OnboardingData } from '@/lib/types';

// Mistral large context window
const MODEL_CONTEXT_LIMIT = 128_000;

export type DevContextProject = {
  id: string;
  name: string;
  strategy: string | null;
  strategy_updated_at: string | null;
};

export type DevContextSession = {
  id: string;
  memory: string | null;
  firmen_recherche: string | null;
  firmen_website: string | null;
  strategy_prep_progress: unknown;
};

export type DevContextProjectMemory = {
  phase: string;
  summary: string;
  created_at: string | null;
};

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Dev only' }, { status: 403 });
  }

  const { messages, onboarding, phase, canvas, project_id, session_id } = await req.json();

  const currentPhase = phase || 'diagnose';
  const supabase = await createSupabaseServerClient();

  let strategieText: string | null = null;
  let project: DevContextProject | null = null;
  let session: DevContextSession | null = null;
  let projectMemory: DevContextProjectMemory[] = [];
  let canvasFromDb: CanvasData | null = null;

  if (project_id && typeof project_id === 'string') {
    try {
      const { data: projRow } = await supabase
        .from('projects')
        .select('id, name, strategy, strategy_updated_at')
        .eq('id', project_id)
        .maybeSingle();
      if (projRow) {
        project = {
          id: projRow.id,
          name: projRow.name,
          strategy: projRow.strategy ?? null,
          strategy_updated_at: projRow.strategy_updated_at ?? null,
        };
        if (projRow.strategy?.trim()) strategieText = projRow.strategy.trim();
      }

      const { data: pcRow } = await supabase
        .from('project_canvas')
        .select('data')
        .eq('project_id', project_id)
        .maybeSingle();
      if (pcRow?.data) canvasFromDb = pcRow.data as CanvasData;

      const { data: memRows } = await supabase
        .from('project_memory')
        .select('phase, summary, created_at')
        .eq('project_id', project_id)
        .order('created_at', { ascending: true });
      projectMemory = (memRows ?? []) as DevContextProjectMemory[];
    } catch { /* dev only — fail open */ }
  }

  if (session_id && typeof session_id === 'string') {
    try {
      const { data: sessRow } = await supabase
        .from('sessions')
        .select('id, memory, firmen_recherche, firmen_website, strategy_prep_progress')
        .eq('id', session_id)
        .maybeSingle();
      if (sessRow) {
        session = {
          id: sessRow.id,
          memory: sessRow.memory ?? null,
          firmen_recherche: sessRow.firmen_recherche ?? null,
          firmen_website: sessRow.firmen_website ?? null,
          strategy_prep_progress: sessRow.strategy_prep_progress ?? null,
        };
      }
    } catch { /* dev only */ }
  }

  const systemPrompt = buildInjectedSystemPrompt({
    phase: currentPhase,
    onboarding: onboarding as Partial<OnboardingData> | null,
    canvas: canvas as CanvasData | null,
    strategie: strategieText,
    memoryText: (onboarding as Partial<OnboardingData> | null)?.memory ?? null,
  });

  const historyStripped = ((messages || []) as Array<{ role: string; content?: string }>).map((m) => {
    let text = m.content || ' ';
    if (m.role === 'assistant') {
      text = text
        .replace(/<canvas_update>[\s\S]*?<\/canvas_update>/g, '')
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
        .replace(/<phase_complete>[\s\S]*?<\/phase_complete>/g, '')
        .replace(/<request_credential>[\s\S]*?<\/request_credential>/g, '')
        .replace(/<deploy_workflow>[\s\S]*?<\/deploy_workflow>/g, '')
        .replace(/<test_workflow>[\s\S]*?<\/test_workflow>/g, '')
        .replace(/<activate_workflow>[\s\S]*?<\/activate_workflow>/g, '')
        .trim() || ' ';
    }
    return { role: m.role, content: text };
  });

  const historyRaw = ((messages || []) as Array<{ role: string; content?: string; id?: string }>).map(m => ({
    id: m.id ?? null,
    role: m.role,
    content: m.content || '',
  }));

  const systemTokens = estimatePromptTokens(systemPrompt);
  const historyTokens = historyStripped.reduce((sum: number, m) => sum + estimatePromptTokens(m.content), 0);
  const totalTokens = systemTokens + historyTokens;
  const pct = Math.round((totalTokens / MODEL_CONTEXT_LIMIT) * 100);

  return NextResponse.json({
    phase: currentPhase,
    model: 'mistral-large-latest',
    contextLimit: MODEL_CONTEXT_LIMIT,
    tokens: {
      system: systemTokens,
      history: historyTokens,
      total: totalTokens,
      pct,
      remaining: MODEL_CONTEXT_LIMIT - totalTokens,
    },
    systemPrompt,
    history: historyStripped,
    historyRaw,
    project,
    session,
    projectMemory,
    canvasClient: canvas ?? null,
    canvasDb: canvasFromDb,
    onboarding: onboarding ?? null,
  });
}
