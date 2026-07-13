import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { requireUser, assertProjectOwner, accessDenied } from '@/lib/access-control';
import { getRequestOrigin } from '@/lib/app-origin';
import { provisionBernd } from '@/lib/bernd/provision';
import type { BerndWizardData } from '@/app/bernd/onboarding/BerndOnboardingWizard';

export const maxDuration = 90;

/**
 * POST /api/bernd/provision { projectId, gewerk, wizardData, chatNotes? }
 *
 * Richtet den Startzustand einer Bernd-Instanz aus dem Onboarding-Wizard ein: Firmenwissen +
 * Persona in den Arbeitsbereich schreiben, `bernd_configs` im Status 'draft' anlegen und
 * `setup_state` mit dem Wizard-Vorwissen vorbefüllen (siehe `lib/bernd/provision.ts`). Deployt
 * NICHTS — das übernimmt erst der "Bernd einstellen"-Klick am Ende des Setup-Chats
 * (`POST /api/bernd/deploy`), nachdem das Completion-Gate erfüllt ist. Cookie-Auth + Projekt-
 * Ownership wie die übrigen `/api/bernd/*`-Routen; `appBaseUrl` kommt aus der Request-Origin
 * (nicht aus Build-Env), damit Callback-URLs auch in Preview-Deployments korrekt sind (siehe
 * lib/app-origin.ts).
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return accessDenied(auth);

  const body = await req.json().catch(() => ({}));
  const { projectId, gewerk, wizardData, chatNotes } = body as {
    projectId?: string;
    gewerk?: string;
    wizardData?: BerndWizardData;
    chatNotes?: string;
  };

  const owner = await assertProjectOwner(supabase, auth.userId, projectId ?? '');
  if (!owner.ok) return accessDenied(owner);

  if (!wizardData || typeof wizardData !== 'object') {
    return NextResponse.json({ error: 'wizardData required' }, { status: 400 });
  }

  const appBaseUrl = getRequestOrigin(req);

  try {
    const result = await provisionBernd(supabase, {
      userId: auth.userId,
      projectId: projectId as string,
      gewerk: gewerk?.trim() || 'sonstiges',
      wizardData,
      chatNotes: chatNotes?.trim() || undefined,
      appBaseUrl,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || 'Provisionierung fehlgeschlagen', config: result.config },
        { status: 500 },
      );
    }
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[bernd/provision] failed:', msg);
    return NextResponse.json({ error: `Provisionierung fehlgeschlagen: ${msg}` }, { status: 500 });
  }
}
