/**
 * Fallback: Coach hat Canvas behauptet, aber kein <canvas_update>-Tag gesendet —
 * extrahiert den Stand per Mistral Small und gibt JSON zurück.
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateCoachCanvasPayload, shouldRecoverCoachCanvas } from '@/lib/coach-canvas-sync';
import { logSync } from '@/lib/sync-decision';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { CanvasData, OnboardingData } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      phase,
      history,
      currentCanvas,
      onboarding,
      lastUserMessage,
      lastAssistantMessage,
      canvasApplied,
      projectId,
    } = body;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ status: 'error', reason: 'unauthorized' }, { status: 401 });
    }

    if (projectId && typeof projectId === 'string') {
      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!project) {
        return NextResponse.json({ status: 'error', reason: 'forbidden' }, { status: 403 });
      }
    }

    const currentPhase = typeof phase === 'string' ? phase : 'diagnose';
    const rawAssistant = typeof lastAssistantMessage === 'string' ? lastAssistantMessage : '';
    const userMsg = typeof lastUserMessage === 'string' ? lastUserMessage : '';

    if (!shouldRecoverCoachCanvas({
      phase: currentPhase,
      rawAssistant,
      userMessage: userMsg,
      canvasApplied: canvasApplied === true,
    })) {
      logSync('canvas', 'skip', 'coach-canvas recovery not needed');
      return NextResponse.json({ status: 'skipped', reason: 'not_needed' });
    }

    logSync('canvas', 'invoke', 'coach-canvas recovery (missing tag)');

    const payload = await generateCoachCanvasPayload({
      phase: currentPhase,
      history: Array.isArray(history) ? history : [],
      currentCanvas: (currentCanvas || {}) as CanvasData,
      onboarding: onboarding as Partial<OnboardingData> | null,
      lastUserMessage: userMsg,
      lastAssistantMessage: rawAssistant,
    });

    if (!payload) {
      logSync('canvas', 'fail', 'coach-canvas recovery: empty payload');
      return NextResponse.json({ status: 'error', reason: 'generation_failed' }, { status: 502 });
    }

    logSync('canvas', 'success', 'coach-canvas recovery payload ready', {
      painPoints: payload.pain_points?.length ?? 0,
      ideaCards: payload.idea_cards?.length ?? 0,
    });

    return NextResponse.json({ status: 'success', canvasUpdate: payload });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    logSync('canvas', 'fail', `coach-canvas: ${message}`);
    return NextResponse.json({ status: 'error', reason: message }, { status: 500 });
  }
}
