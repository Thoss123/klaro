import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join, basename } from 'path';
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

  // n8n's built-in node/langchain icon set is bundled locally under
  // public/n8n-icons/nodes. Serve by BASENAME first (offline + fast) for ANY
  // .svg path — not just "node/…". The npm-catalog fallback (used when the n8n
  // instance returns 401 on /types/*) resolves core icons to bare "if.svg",
  // "edit-fields.svg", … without the "node/" prefix; without this they 404'd
  // because the instance has no such file and the CDN is unreliable.
  const localName = basename(path);
  if (localName.endsWith('.svg')) {
    try {
      const file = join(process.cwd(), 'public', 'n8n-icons', 'nodes', localName);
      const body = await readFile(file);
      return new NextResponse(new Uint8Array(body), {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' },
      });
    } catch {
      // not bundled — fall through to the network candidates below
    }
  }

  const bundled = resolveBundledIconUrl(path);
  const instanceUrl = `${getN8nPublicBase()}/icons/${path}`;
  // Built-in pseudo-icons (fa:/node:) have no file on the instance — it returns
  // its SPA index.html — so go straight to the real CDN (FontAwesome / n8n
  // design-system). File icons (gmail, code, …) load best from the instance.
  const isBuiltin = path.startsWith('fa/') || path.startsWith('node/');
  const candidates = (isBuiltin
    ? [bundled, instanceUrl]
    : [instanceUrl, bundled]
  ).filter((url): url is string => Boolean(url));

  for (const url of candidates) {
    try {
      const res = await fetch(url, { next: { revalidate: 86400 } });
      if (!res.ok) continue;
      const upstreamType = res.headers.get('content-type') || '';
      // n8n serves its SPA index.html (HTTP 200) for unknown icon paths — e.g. the
      // FontAwesome (fa:) and built-in (node:) pseudo-icons used by IF / AI Agent.
      // That HTML must never be returned as an icon, or we'd render a broken image.
      if (upstreamType.includes('text/html')) continue;
      const body = await res.arrayBuffer();
      const contentType = upstreamType.startsWith('image/')
        ? upstreamType
        : (path.endsWith('.png') ? 'image/png' : 'image/svg+xml');
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
