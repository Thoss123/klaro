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
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { researchCompany } from '@/lib/company-research';
import { generateInitialStrategy, updateStrategy } from '@/lib/strategy';
import type { CanvasData, OnboardingData } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { projectId, sessionId, mode, phase, summary } = await req.json();

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

    // Ownership-Check: Projekt muss dem Nutzer gehören.
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

      // 1) Firmen-Recherche (ersetzt den separaten /api/company-research-Aufruf).
      let recherche: string | null = session.firmen_recherche || null;
      if (!recherche && session.firmenname) {
        recherche = await researchCompany(session.firmenname, session.branche, session.firmen_website || undefined);
        if (recherche) {
          const { error } = await supabase
            .from('sessions')
            .update({ firmen_recherche: recherche })
            .eq('id', sessionId)
            .eq('user_id', user.id);
          if (error) console.warn('[strategy] firmen_recherche speichern fehlgeschlagen:', error.message);
        }
      }

      // 2) Strategie generieren.
      strategy = await generateInitialStrategy({ onboarding, recherche });
    } else {
      const current = (project.strategy || '').trim();
      if (!current) {
        // Ohne Basis-Dokument gibt es nichts fortzuschreiben — still bleiben,
        // die nächste 'initial'-Generierung holt das nach.
        return NextResponse.json({ status: 'skipped', reason: 'no_existing_strategy' });
      }
      const { data: canvasRow } = await supabase
        .from('project_canvas')
        .select('data')
        .eq('project_id', projectId)
        .maybeSingle();
      strategy = await updateStrategy({
        current,
        trigger: mode,
        phase: typeof phase === 'string' ? phase : undefined,
        phaseSummary: typeof summary === 'string' ? summary : undefined,
        canvas: (canvasRow?.data || null) as Partial<CanvasData> | null,
      });
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

    console.log(`[strategy] ${mode} → gespeichert (project=${projectId}, ${strategy.length} chars)`);
    return NextResponse.json({ status: 'updated', mode });
  } catch (e: unknown) {
    console.error('[strategy] failed (fail-open):', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ status: 'error', reason: 'exception' });
  }
}
