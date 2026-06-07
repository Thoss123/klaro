import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  getN8nCatalog,
  getCatalogIndex,
  getNodeByName,
  getCredentialByName,
} from '@/lib/n8n-catalog';
import { filterIndexByCategory, searchCatalogIndex } from '@/lib/n8n-categories';
import type { KlaroN8nCategory } from '@/lib/n8n-categories';
import { isN8nMcpConfigured, mcpSearchNodes } from '@/lib/n8n-mcp-bridge';
import { mergeCatalogSearchResults, parseMcpSearchNodesResults } from '@/lib/n8n-mcp-search';

/** GET /api/n8n/catalog — nodes + credentials snapshot (cached). */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const refresh = req.nextUrl.searchParams.get('refresh') === '1';
  const nodeType = req.nextUrl.searchParams.get('node');
  const credType = req.nextUrl.searchParams.get('credential');
  const category = req.nextUrl.searchParams.get('category') as KlaroN8nCategory | null;
  const q = req.nextUrl.searchParams.get('q');
  const indexOnly = req.nextUrl.searchParams.get('index') === '1';

  const catalog = await getN8nCatalog(refresh);

  if (nodeType) {
    const node = getNodeByName(catalog, nodeType);
    if (!node) return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    return NextResponse.json({ node, fetchedAt: catalog.fetchedAt, source: catalog.source });
  }

  if (credType) {
    const credential = getCredentialByName(catalog, credType);
    if (!credential) return NextResponse.json({ error: 'Credential not found' }, { status: 404 });
    return NextResponse.json({ credential, fetchedAt: catalog.fetchedAt, source: catalog.source });
  }

  const index = await getCatalogIndex(refresh);

  if (indexOnly || category || q) {
    let filtered = index;
    if (category) filtered = filterIndexByCategory(filtered, category);
    if (q) filtered = searchCatalogIndex(filtered, q);

    let searchSource: 'local' | 'mcp' | 'merged' = 'local';
    if (q?.trim() && isN8nMcpConfigured()) {
      try {
        const mcp = await mcpSearchNodes([q.trim()]);
        const mcpEntries = parseMcpSearchNodesResults(mcp.results);
        if (mcpEntries.length) {
          filtered = mergeCatalogSearchResults(filtered, mcpEntries);
          if (category) filtered = filterIndexByCategory(filtered, category);
          searchSource = filtered.length > 0 ? 'merged' : 'mcp';
        }
      } catch {
        // Lokale Suche bleibt
      }
    }

    return NextResponse.json({
      index: filtered,
      fetchedAt: catalog.fetchedAt,
      source: catalog.source,
      searchSource,
      total: filtered.length,
    });
  }

  return NextResponse.json({
    nodes: catalog.nodes,
    credentials: catalog.credentials,
    index,
    fetchedAt: catalog.fetchedAt,
    source: catalog.source,
  });
}
