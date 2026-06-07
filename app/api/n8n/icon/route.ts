import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getN8nPublicBase, getCatalogIndex, resolveBundledIconUrl } from '@/lib/n8n-catalog';

function sanitizeIconPath(raw: string | null): string | null {
  if (!raw) return null;
  const path = decodeURIComponent(raw).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!path || path.includes('..')) return null;
  return path;
}

/** Resolve the REAL icon path from the catalog (uses the node's iconUrl, not a guess). */
async function iconPathForNode(nodeType: string): Promise<string | null> {
  try {
    const index = await getCatalogIndex();
    const entry = index.find(e => e.name === nodeType);
    return entry?.iconPath ? sanitizeIconPath(entry.iconPath) : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/n8n/icon?node=n8n-nodes-base.gmail  — echtes Icon aus dem Katalog (empfohlen)
 * GET /api/n8n/icon?path=n8n-nodes-base/dist/nodes/Gmail/gmail.svg — direkter Pfad (Fallback)
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const nodeType = req.nextUrl.searchParams.get('node');
  const path = nodeType
    ? await iconPathForNode(nodeType)
    : sanitizeIconPath(req.nextUrl.searchParams.get('path'));
  if (!path) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });

  const candidates = [
    `${getN8nPublicBase()}/icons/${path}`,
    resolveBundledIconUrl(path),
    // fa/map-signs.svg, node/ai-agent.svg — nur auf der n8n-Instanz
    path.startsWith('fa/') || path.startsWith('node/')
      ? `${getN8nPublicBase()}/icons/${path}`
      : null,
  ].filter((url): url is string => Boolean(url));

  for (const url of candidates) {
    try {
      const res = await fetch(url, { next: { revalidate: 86400 } });
      if (!res.ok) continue;
      const body = await res.arrayBuffer();
      const contentType = res.headers.get('content-type')
        || (path.endsWith('.png') ? 'image/png' : 'image/svg+xml');
      return new NextResponse(body, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } catch {
      // try next source
    }
  }

  return NextResponse.json({ error: 'Icon not found' }, { status: 404 });
}
