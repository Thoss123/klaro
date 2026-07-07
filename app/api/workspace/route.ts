import { NextRequest, NextResponse } from 'next/server';
import { resolveCaller } from '@/lib/machine-auth';
import { listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFile } from '@/lib/workspace';

/**
 * Workspace-Store API — bedient App-UI (Cookie-Session) und n8n (Bearer-Token).
 *
 * GET  /api/workspace?project_id=..&path=rules/company_base.md  → { content }
 * GET  /api/workspace?project_id=..&prefix=rules/               → { files: [...] }
 * PUT  /api/workspace  { project_id, path, content, updated_by? } → { file }
 */

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('project_id');
  const caller = await resolveCaller(req, projectId);
  if ('error' in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 });

  const path = req.nextUrl.searchParams.get('path');
  if (path) {
    const content = await readWorkspaceFile(caller.supabase, projectId, path);
    return NextResponse.json({ path, content });
  }

  const prefix = req.nextUrl.searchParams.get('prefix') ?? undefined;
  const files = await listWorkspaceFiles(caller.supabase, projectId, prefix);
  return NextResponse.json({ files });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { project_id, path, content, updated_by } = body as {
    project_id?: string;
    path?: string;
    content?: string;
    updated_by?: string;
  };

  const caller = await resolveCaller(req, project_id ?? null);
  if ('error' in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!project_id || !path || typeof content !== 'string') {
    return NextResponse.json({ error: 'project_id, path, content required' }, { status: 400 });
  }

  const file = await writeWorkspaceFile(caller.supabase, {
    userId: caller.userId,
    projectId: project_id,
    path,
    content,
    updatedBy: updated_by ?? caller.userId,
  });
  if (!file) return NextResponse.json({ error: 'write failed' }, { status: 500 });
  return NextResponse.json({ file });
}
