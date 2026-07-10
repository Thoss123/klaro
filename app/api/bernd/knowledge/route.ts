import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { requireUser, assertProjectOwner, accessDenied } from '@/lib/access-control';
import { listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFile } from '@/lib/workspace';

/**
 * GET /api/bernd/knowledge?projectId=<id>            → Liste aller workspace_files (Metadaten)
 * GET /api/bernd/knowledge?projectId=<id>&path=<path> → Inhalt einer einzelnen Datei
 * PUT /api/bernd/knowledge { projectId, path, content } → Datei speichern (Upsert)
 *
 * Cookie-Auth (eingeloggter User), Projekt-Ownership via lib/access-control.ts.
 * Nutzt lib/workspace.ts — keine eigene DB-Logik hier (Bernds Wissen bleibt EINE Quelle).
 */

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return accessDenied(auth);

  const projectId = req.nextUrl.searchParams.get('projectId') ?? '';
  const owner = await assertProjectOwner(supabase, auth.userId, projectId);
  if (!owner.ok) return accessDenied(owner);

  const path = req.nextUrl.searchParams.get('path');
  if (path) {
    const content = await readWorkspaceFile(supabase, projectId, path);
    return NextResponse.json({ path, content });
  }

  const files = await listWorkspaceFiles(supabase, projectId);
  return NextResponse.json({ files });
}

export async function PUT(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return accessDenied(auth);

  const body = await req.json().catch(() => ({}));
  const { projectId, path, content } = body as {
    projectId?: string;
    path?: string;
    content?: string;
  };

  const owner = await assertProjectOwner(supabase, auth.userId, projectId ?? '');
  if (!owner.ok) return accessDenied(owner);

  if (!path?.trim() || typeof content !== 'string') {
    return NextResponse.json({ error: 'path und content werden benötigt' }, { status: 400 });
  }

  const file = await writeWorkspaceFile(supabase, {
    userId: auth.userId,
    projectId: projectId as string,
    path: path.trim(),
    content,
    updatedBy: auth.userId,
  });

  if (!file) {
    return NextResponse.json({ error: 'Datei konnte nicht gespeichert werden' }, { status: 500 });
  }

  return NextResponse.json({ file });
}
