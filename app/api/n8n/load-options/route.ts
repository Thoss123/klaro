import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { isN8nMcpConfigured, mcpGetNodeTypes } from '@/lib/n8n-mcp-bridge';
import {
  parsePropertyOptionsFromDefinitions,
  sliceNodeDefinitions,
} from '@/lib/n8n-node-type-parser';
import { dedupePropertyOptions, resolveStaticOptions } from '@/lib/n8n-static-options';
import { fetchAirtableOptions, isUuid, supportsDynamicOptions } from '@/lib/n8n-dynamic-options';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Credential-Token für den User laden und entschlüsseln.
 * Das Frontend sendet die n8n-Credential-ID (`n8n_credential_id`); ältere
 * Stände schickten die Supabase-Zeilen-ID (UUID) — beides akzeptieren.
 */
async function loadCredentialToken(
  supabase: SupabaseClient,
  userId: string,
  credentialId: string,
): Promise<string | null> {
  // `id` ist eine UUID-Spalte — ein Nicht-UUID-Wert würde den Query crashen.
  const columns = isUuid(credentialId) ? ['id', 'n8n_credential_id'] : ['n8n_credential_id'];
  for (const column of columns) {
    const { data } = await supabase
      .from('user_credentials')
      .select('encrypted_value')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq(column, credentialId)
      .limit(1);
    const encrypted = data?.[0]?.encrypted_value as string | undefined;
    if (encrypted) {
      const { decrypt } = await import('@/lib/encryption');
      return decrypt(encrypted);
    }
  }
  return null;
}

/**
 * POST /api/n8n/load-options — dynamische Dropdowns (Modelle, Operationen …).
 * Reihenfolge: Mistral-API → Anbieter-API (Airtable) → statisch → n8n MCP get_node_types.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { nodeType, propertyName, parameters, credentialId } = await req.json() as {
    nodeType?: string;
    propertyName?: string;
    parameters?: Record<string, unknown>;
    credentialId?: string;
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

  // Anbieter-API (z. B. Airtable Bases/Tables) — live mit dem User-Credential laden.
  if (credentialId && supportsDynamicOptions(nodeType, propertyName)) {
    try {
      const token = await loadCredentialToken(supabase, user.id, credentialId);
      if (token) {
        const options = await fetchAirtableOptions({ token, propertyName, parameters });
        if (options?.length) {
          return NextResponse.json({
            options: dedupePropertyOptions(options),
            source: 'airtable-api',
          });
        }
      } else {
        console.warn(`[load-options] Credential ${credentialId} nicht gefunden (user ${user.id})`);
      }
    } catch (e) {
      console.error('[load-options] Anbieter-API fehlgeschlagen:', e);
      // Fallback unten
    }
  }

  const staticOptions = resolveStaticOptions(nodeType, propertyName);
  if (staticOptions.length) {
    return NextResponse.json({ options: staticOptions, source: 'static' });
  }

  if (isN8nMcpConfigured()) {
    try {
      const nodeRef: { nodeId: string; resource?: string; operation?: string; mode?: string } = { nodeId: nodeType };
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
