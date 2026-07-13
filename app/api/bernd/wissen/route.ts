import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { requireUser, assertProjectOwner, accessDenied } from '@/lib/access-control';
import { writeWorkspaceFile } from '@/lib/workspace';
import { upsertBerndSetupState } from '@/lib/bernd/config';

/**
 * POST /api/bernd/wissen { project_id, typ, texte: string[] } → { ok, path, state }
 *
 * Speichert gezielt abgefragtes Wissen aus dem Setup-Chat (`<wissen_anfrage typ="…"
 * anzahl="…"/>`-Tag, gerendert von `components/bernd/UploadSlot.tsx`) als Regel-Datei im
 * Workspace-Store (`lib/workspace.ts#writeWorkspaceFile`) — derselbe Speicher, den der
 * n8n-Agent zur Laufzeit für Entwürfe liest. Cookie-Auth + Projekt-Ownership wie die
 * übrigen `/api/bernd/*`-Routen (Muster aus `app/api/bernd/pair/route.ts`).
 *
 * Patcht zusätzlich `setup_state.wissen[typ]` mit dem geschriebenen Dateipfad (Integrations-
 * Fix: ohne diesen Patch bleibt das optionale Gate-Item "Stilproben hochgeladen"
 * (`lib/bernd/gate.ts`, prüft `setupState.wissen.mail_stilproben`) für immer offen, weil
 * sonst nichts den Upload-Erfolg ins Profil-Canvas zurückspiegelt — der Response liefert den
 * aktualisierten State, damit `SetupChat.tsx` ihn direkt übernehmen kann statt die
 * Merge-Logik clientseitig zu duplizieren.
 */

/** Menschlich lesbare Überschriften für bekannte Wissens-Typen. */
const TITLE_BY_TYP: Record<string, string> = {
  mail_stilproben: 'E-Mail-Stilproben',
  preisliste: 'Preisliste',
};

/** Nur `[a-z0-9_-]` — verhindert Pfad-Injection über den vom Tag gelieferten `typ`-Wert. */
function sanitizeTyp(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/** Bekannte Typen bekommen einen festen, sprechenden Pfad; alles andere ist generisch. */
function pathForTyp(typ: string): string {
  if (typ === 'mail_stilproben') return 'rules/stilproben.md';
  if (typ === 'preisliste') return 'rules/preisliste.md';
  return `rules/wissen_${typ}.md`;
}

function buildContent(typ: string, texte: string[]): string {
  const title = TITLE_BY_TYP[typ] ?? `Wissen: ${typ}`;
  const proben = texte.map((t, i) => `## Probe ${i + 1}\n${t.trim()}`).join('\n\n');
  return `# ${title}\n\n${proben}\n`;
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return accessDenied(auth);

  const body = await req.json().catch(() => ({}));
  const { project_id, typ: rawTyp, texte } = body as {
    project_id?: string;
    typ?: string;
    texte?: unknown;
  };

  const owner = await assertProjectOwner(supabase, auth.userId, project_id ?? '');
  if (!owner.ok) return accessDenied(owner);

  const typ = sanitizeTyp(rawTyp ?? '');
  if (!typ) {
    return NextResponse.json({ error: 'typ required' }, { status: 400 });
  }

  const nonEmpty = Array.isArray(texte)
    ? texte.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    : [];
  if (nonEmpty.length === 0) {
    return NextResponse.json(
      { error: 'texte required (mindestens ein nicht-leerer Eintrag)' },
      { status: 400 },
    );
  }

  const path = pathForTyp(typ);
  const content = buildContent(typ, nonEmpty);

  const saved = await writeWorkspaceFile(supabase, {
    userId: auth.userId,
    projectId: project_id as string,
    path,
    content,
    updatedBy: 'bernd_setup',
  });

  if (!saved) {
    return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
  }

  const state = await upsertBerndSetupState(supabase, {
    userId: auth.userId,
    projectId: project_id as string,
    patch: { wissen: { [typ]: [path] } },
  });

  return NextResponse.json({ ok: true, path, state });
}
