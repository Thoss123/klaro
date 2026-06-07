import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { isN8nMcpConfigured, mcpGetNodeTypes } from '@/lib/n8n-mcp-bridge';
import {
  parsePropertyOptionsFromDefinitions,
  sliceNodeDefinitions,
} from '@/lib/n8n-node-type-parser';
import { dedupePropertyOptions, resolveStaticOptions } from '@/lib/n8n-static-options';

/**
 * POST /api/n8n/load-options — dynamische Dropdowns (Modelle, Operationen …).
 * Reihenfolge: Mistral-API → statisch → n8n MCP get_node_types.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { nodeType, propertyName, parameters } = await req.json() as {
    nodeType?: string;
    propertyName?: string;
    parameters?: Record<string, unknown>;
  };

  if (!nodeType || !propertyName) {
    return NextResponse.json({ error: 'nodeType and propertyName required' }, { status: 400 });
  }

  // Mistral Chat Model: live von API wenn Key da
  if (
    propertyName === 'model'
    && /mistral/i.test(nodeType)
    && process.env.MISTRAL_API_KEY
  ) {
    try {
      const res = await fetch('https://api.mistral.ai/v1/models', {
        headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
      });
      if (res.ok) {
        const data = await res.json() as { data?: { id: string }[] };
        const options = dedupePropertyOptions(
          (data.data ?? [])
            .filter(m => !m.id.includes('embed'))
            .map(m => ({ name: m.id, value: m.id })),
        );
        if (options.length) return NextResponse.json({ options, source: 'mistral-api' });
      }
    } catch {
      // Fallback unten
    }
  }

  const staticOptions = resolveStaticOptions(nodeType, propertyName);
  if (staticOptions.length) {
    return NextResponse.json({ options: staticOptions, source: 'static' });
  }

  if (isN8nMcpConfigured()) {
    try {
      const nodeRef: Record<string, unknown> = { nodeId: nodeType };
      if (parameters?.resource) nodeRef.resource = String(parameters.resource);
      if (parameters?.operation) nodeRef.operation = String(parameters.operation);
      if (parameters?.mode) nodeRef.mode = String(parameters.mode);

      const { definitions } = await mcpGetNodeTypes([nodeRef]);
      const slice = sliceNodeDefinitions(definitions, nodeType);
      const mcpOptions = parsePropertyOptionsFromDefinitions(slice, propertyName);
      if (mcpOptions.length) {
        return NextResponse.json({ options: mcpOptions, source: 'mcp' });
      }
    } catch {
      // statischer/leerer Fallback
    }
  }

  return NextResponse.json({
    options: staticOptions,
    source: 'static',
  });
}
