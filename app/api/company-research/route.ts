/**
 * Runs right after onboarding, before the first chat message: does a one-shot
 * web search on the company the user just entered and stores a short summary
 * on the session so Phase 1 can open with "das hab ich gefunden — stimmt das
 * so?" instead of asking cold. Fails open — onboarding must never block on
 * this failing or being slow.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { researchCompany } from '@/lib/company-research';

export async function POST(req: NextRequest) {
  try {
    const { sessionId, firmenname, branche } = await req.json();

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId fehlt' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
    }

    const research = await researchCompany(firmenname, branche);
    if (!research) {
      return NextResponse.json({ research: null });
    }

    const { error } = await supabase
      .from('sessions')
      .update({ firmen_recherche: research })
      .eq('id', sessionId)
      .eq('user_id', user.id);

    if (error) {
      console.warn('[company-research] Speichern fehlgeschlagen:', error.message);
      return NextResponse.json({ research: null });
    }

    return NextResponse.json({ research });
  } catch (e) {
    console.error('[company-research] failed:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ research: null });
  }
}
