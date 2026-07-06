/**
 * Interne Gesprächsstrategie (projects.strategy) — generieren & fortschreiben.
 *
 * mode='initial'          — direkt nach dem Onboarding: Firmen-Recherche (Tavily)
 *                           + Branchen-Wissen + Onboarding → Strategie-Dokument.
 *                           Speichert zusätzlich sessions.firmen_recherche.
 * mode='phase_transition' — nach jedem Phasenwechsel (mit Phasen-Zusammenfassung).
 * mode='canvas_delta'     — debounced nach relevanten Canvas-Änderungen.
 *
 * Fail-open: Fehler blockieren weder Onboarding noch Chat — es gibt dann
 * einfach (noch) keine/keine neue Strategie.
 *
 * stream:true (nur initial) → NDJSON-Fortschritt (5 echte Pipeline-Schritte).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { runInitialStrategyPipeline, updateStrategy } from '@/lib/strategy';
import type { StrategyPrepProgress } from '@/lib/strategy-prep';
import type { CanvasData, OnboardingData } from '@/lib/types';

async function persistInitialStrategy(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  projectId: string,
  sessionId: string,
  strategy: string,
  recherche: string | null,
  existingRecherche: string | null,
): Promise<{ ok: boolean; status: string }> {
  if (recherche && !existingRecherche) {
    const { error } = await supabase
      .from('sessions')
      .update({ firmen_recherche: recherche })
      .eq('id', sessionId)
      .eq('user_id', userId);
    if (error) console.warn('[strategy] firmen_recherche speichern fehlgeschlagen:', error.message);
  }

  const { error: saveError } = await supabase
    .from('projects')
    .update({ strategy: strategy.trim(), strategy_updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('user_id', userId);
  if (saveError) {
    console.warn('[strategy] Speichern fehlgeschlagen:', saveError.message);
    return { ok: false, status: 'db_save_failed' };
  }

  console.log(`[strategy] initial → gespeichert (project=${projectId}, ${strategy.length} chars)`);
  return { ok: true, status: 'updated' };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, sessionId, mode, phase, summary, stream: wantStream } = body;

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ status: 'skipped', reason: 'missing_project_id' });
    }
    if (mode !== 'initial' && mode !== 'phase_transition' && mode !== 'canvas_delta') {
      return NextResponse.json({ status: 'skipped', reason: 'invalid_mode' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ status: 'skipped', reason: 'unauthorized' }, { status: 401 });
    }
    const { canAfford, debitFromUsage } = await import('@/lib/billing/credits');
    const affordability = await canAfford(user.id, 1);
    if (!affordability.ok) {
      return NextResponse.json(
        {
          code: 'INSUFFICIENT_CREDITS',
          balance: affordability.balance,
          required: affordability.required,
        },
        { status: 402 },
      );
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id, strategy')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!project) {
      return NextResponse.json({ status: 'skipped', reason: 'project_not_found' }, { status: 404 });
    }

    let strategy: string | null = null;
    let strategyUsage = {};
    let strategyModel = 'claude-sonnet-5';

    if (mode === 'initial') {
      if (!sessionId || typeof sessionId !== 'string') {
        return NextResponse.json({ status: 'skipped', reason: 'missing_session_id' });
      }
      const { data: session } = await supabase
        .from('sessions')
        .select('ziel, ki_erfahrung, wer_setzt_um, hindernis, branche, tempo, unternehmensgroesse, technik_level, vorname, firmenname, rolle_im_unternehmen, firmen_website, firmen_recherche')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!session) {
        return NextResponse.json({ status: 'skipped', reason: 'session_not_found' }, { status: 404 });
      }

      const onboarding = session as Partial<OnboardingData>;
      const existingRecherche = session.firmen_recherche || null;

      let prepProgressPersistOk = true;
      const saveProgress = async (progress: StrategyPrepProgress) => {
        if (!prepProgressPersistOk) return;
        const { error } = await supabase
          .from('sessions')
          .update({ strategy_prep_progress: progress })
          .eq('id', sessionId)
          .eq('user_id', user.id);
        if (error) {
          console.warn('[strategy] prep progress speichern fehlgeschlagen:', error.message);
          if (error.message.includes('strategy_prep_progress')) prepProgressPersistOk = false;
        }
      };

      const runPipeline = async (onProgress: (p: StrategyPrepProgress) => void | Promise<void>) =>
        runInitialStrategyPipeline({
          onboarding,
          existingRecherche,
          onProgress,
        });

      if (wantStream === true) {
        const encoder = new TextEncoder();
        const readable = new ReadableStream({
          async start(controller) {
            const emit = (payload: Record<string, unknown>) => {
              controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
            };
            let lastProgress: StrategyPrepProgress | null = null;
            try {
              const { strategy: generated, recherche, usage, model } = await runPipeline(async p => {
                lastProgress = p;
                await saveProgress(p);
                emit({ type: 'progress', progress: p });
              });
              strategyUsage = usage;
              strategyModel = model;

              if (!generated?.trim()) {
                emit({ type: 'done', status: 'skipped', reason: 'no_strategy_generated', progress: lastProgress });
                controller.close();
                return;
              }

              const saved = await persistInitialStrategy(
                supabase,
                user.id,
                projectId,
                sessionId,
                generated,
                recherche,
                existingRecherche,
              );
              if (saved.ok) {
                await debitFromUsage({
                  userId: user.id,
                  usage: strategyUsage,
                  model: strategyModel,
                  action: 'strategy_initial',
                  projectId,
                  sessionId,
                  metadata: { mode },
                }).catch(e => console.warn('[billing] strategy initial debit failed:', e instanceof Error ? e.message : String(e)));
              }
              emit({ type: 'done', status: saved.status, progress: lastProgress });
            } catch (e: unknown) {
              console.error('[strategy] stream pipeline failed:', e instanceof Error ? e.message : String(e));
              emit({ type: 'error', reason: 'exception', progress: lastProgress });
            } finally {
              controller.close();
            }
          },
        });
        return new Response(readable, {
          headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        });
      }

      const { strategy: generated, recherche, usage, model } = await runPipeline(saveProgress);
      strategy = generated;
      strategyUsage = usage;
      strategyModel = model;
      if (strategy?.trim()) {
        const saved = await persistInitialStrategy(
          supabase,
          user.id,
          projectId,
          sessionId,
          strategy,
          recherche,
          existingRecherche,
        );
        if (!saved.ok) {
          return NextResponse.json({ status: 'error', reason: saved.status }, { status: 500 });
        }
        await debitFromUsage({
          userId: user.id,
          usage: strategyUsage,
          model: strategyModel,
          action: 'strategy_initial',
          projectId,
          sessionId,
          metadata: { mode },
        }).catch(e => console.warn('[billing] strategy initial debit failed:', e instanceof Error ? e.message : String(e)));
        return NextResponse.json({ status: 'updated', mode });
      }
    } else {
      const current = (project.strategy || '').trim();
      if (!current) {
        return NextResponse.json({ status: 'skipped', reason: 'no_existing_strategy' });
      }
      const { data: canvasRow } = await supabase
        .from('project_canvas')
        .select('data')
        .eq('project_id', projectId)
        .maybeSingle();
      const updated = await updateStrategy({
        current,
        trigger: mode,
        phase: typeof phase === 'string' ? phase : undefined,
        phaseSummary: typeof summary === 'string' ? summary : undefined,
        canvas: (canvasRow?.data || null) as Partial<CanvasData> | null,
      });
      strategy = updated.strategy;
      strategyUsage = updated.usage;
      strategyModel = updated.model;
      if (strategy && strategy.trim() === current) {
        return NextResponse.json({ status: 'unchanged' });
      }
    }

    if (!strategy?.trim()) {
      return NextResponse.json({ status: 'skipped', reason: 'no_strategy_generated' });
    }

    const { error: saveError } = await supabase
      .from('projects')
      .update({ strategy: strategy.trim(), strategy_updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .eq('user_id', user.id);
    if (saveError) {
      console.warn('[strategy] Speichern fehlgeschlagen:', saveError.message);
      return NextResponse.json({ status: 'error', reason: 'db_save_failed' }, { status: 500 });
    }
    await debitFromUsage({
      userId: user.id,
      usage: strategyUsage,
      model: strategyModel,
      action: `strategy_${mode}`,
      projectId,
      sessionId: typeof sessionId === 'string' ? sessionId : null,
      metadata: { mode, phase },
    }).catch(e => console.warn('[billing] strategy debit failed:', e instanceof Error ? e.message : String(e)));

    console.log(`[strategy] ${mode} → gespeichert (project=${projectId}, ${strategy.length} chars)`);
    return NextResponse.json({ status: 'updated', mode });
  } catch (e: unknown) {
    console.error('[strategy] failed (fail-open):', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ status: 'error', reason: 'exception' });
  }
}
