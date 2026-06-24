import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { encrypt } from '@/lib/encryption';
import { createN8nCredential, deleteN8nCredential, getN8nCredentialSchema } from '@/lib/n8n';
import { getN8nCatalog, getCredentialByName } from '@/lib/n8n-catalog';
import { CREDENTIAL_TYPE } from '@/lib/workflow-generator';

const SECRET_FIELD_NAMES = ['apiKey', 'apiToken', 'accessToken', 'token', 'apiSecret', 'secretKey', 'key', 'password'];

type N8nCredSchema = {
  properties?: Record<string, { type?: string; default?: unknown; enum?: unknown[] }>;
  required?: string[];
  allOf?: Array<{ if?: { properties?: Record<string, { enum?: unknown[] }> } }>;
};

/**
 * Baut gültige Credential-`data` aus dem n8n-JSON-Schema.
 * n8n-Credentials nutzen allOf-Bedingungen (if/then/else): z. B. „wenn allowedHttpRequestDomains
 * === 'domains', dann ist allowedDomains Pflicht; sonst verboten" und „wenn header === true, dann
 * headerName/headerValue Pflicht". ACHTUNG JSON-Schema-Falle: fehlt das Steuerfeld, matcht das `if`
 * trotzdem (vacuously) → der then-Zweig greift. Darum setzen wir jedes Steuerfeld EXPLIZIT auf einen
 * Wert, der den einfacheren else-Zweig wählt (keine Zusatz-Pflichtfelder).
 */
function buildFromN8nSchema(schema: N8nCredSchema, value: string): Record<string, unknown> {
  const props = schema.properties ?? {};
  const names = Object.keys(props);
  const required = schema.required ?? [];
  const data: Record<string, unknown> = {};
  const controls = new Set<string>();

  for (const cond of schema.allOf ?? []) {
    const ifProps = cond?.if?.properties ?? {};
    for (const ctrl of Object.keys(ifProps)) {
      controls.add(ctrl);
      const trigger = ifProps[ctrl]?.enum ?? [];
      const p = props[ctrl] ?? {};
      if (p.type === 'boolean') {
        data[ctrl] = !trigger.includes(true); // else-Zweig (z. B. header:false)
      } else if (Array.isArray(p.enum)) {
        data[ctrl] = p.enum.find(v => !trigger.includes(v)) ?? p.enum[0]; // z. B. "all" statt "domains"
      } else {
        data[ctrl] = '';
      }
    }
  }

  const secret =
    SECRET_FIELD_NAMES.find(n => names.includes(n))
    ?? required.find(n => props[n]?.type === 'string' && !controls.has(n))
    ?? names.find(n => props[n]?.type === 'string' && !controls.has(n))
    ?? names[0];
  if (secret) data[secret] = value;

  for (const n of required) {
    if (data[n] === undefined) data[n] = Array.isArray(props[n]?.enum) ? props[n]!.enum![0] : '';
  }
  return data;
}

/**
 * Baut das `data`-Objekt für n8n aus dem ECHTEN Credential-Schema (nicht hartkodiert `apiKey`).
 * Behebt: „request.body.data is not allowed to have the additional property apiKey" und
 * „data requires property allowedDomains" — je nach Credential-Typ heißen die Felder anders
 * und manche Pflichtfelder (z. B. allowedDomains) müssen mitgeschickt werden.
 *
 * Quelle 1 (autoritativ): n8n-Instanz GET /credentials/schema/{type} — exakt das Validierungs-Schema.
 * Quelle 2: gebündelter Katalog. Quelle 3: Fallback { apiKey }.
 */
async function buildCredentialData(n8nType: string, value: string): Promise<Record<string, unknown>> {
  const cleanType = n8nType.split('.').pop() || n8nType;
  // 1) Autoritatives Schema direkt von n8n (inkl. allOf if/then/else-Bedingungen).
  try {
    const schema: N8nCredSchema | null = await getN8nCredentialSchema(cleanType);
    if (schema?.properties && Object.keys(schema.properties).length) {
      return buildFromN8nSchema(schema, value);
    }
  } catch (e) {
    console.warn('[credentials] n8n-Schema nicht abrufbar, versuche Katalog:', e instanceof Error ? e.message : e);
  }

  // 2) Gebündelter Katalog (N8nCredentialProperty[]).
  try {
    const catalog = await getN8nCatalog();
    const props = getCredentialByName(catalog, n8nType)?.properties ?? [];
    if (props.length) {
      const data: Record<string, unknown> = {};
      for (const p of props) {
        if (p.default !== undefined && p.default !== null) data[p.name] = p.default;
      }
      const names = props.map(p => p.name);
      const secret =
        SECRET_FIELD_NAMES.find(n => names.includes(n))
        ?? props.find(p => p.type === 'password')?.name
        ?? props.find(p => p.required && (p.type === 'string' || !p.type))?.name
        ?? props.find(p => p.type === 'string')?.name
        ?? names[0];
      if (secret) data[secret] = value;
      for (const p of props) {
        if (p.required && data[p.name] === undefined) data[p.name] = '';
      }
      return data;
    }
  } catch (e) {
    console.error('[credentials] Katalog-Lookup fehlgeschlagen, Fallback apiKey:', e);
  }

  // 3) Letzter Fallback (die meisten API-Key-Credentials nutzen apiKey).
  return { apiKey: value };
}

// POST /api/n8n/credentials — store + create credential in n8n
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { project_id, tool_name, credential_type, value, n8n_credential_type } = await req.json();
  if (!project_id || !tool_name || !value) {
    return NextResponse.json({ error: 'project_id, tool_name, value required' }, { status: 400 });
  }

  const encrypted_value = encrypt(value);

  // Create credential in n8n
  let n8n_credential_id: string | null = null;
  let n8nError: string | null = null;
  try {
    const n8nTypeRaw = n8n_credential_type || CREDENTIAL_TYPE[tool_name];
    if (n8nTypeRaw) {
      const n8nType = n8nTypeRaw.split('.').pop() || n8nTypeRaw;
      const cred = await createN8nCredential({
        name: `${user.id.slice(0, 8)}-${tool_name}`,
        type: n8nType,
        data: await buildCredentialData(n8nTypeRaw, value),
      });
      n8n_credential_id = cred.id;
    }
  } catch (e) {
    n8nError = e instanceof Error ? e.message : 'n8n credential creation failed';
    console.error('n8n credential creation failed:', n8nError);
    // Continue — credential is still saved locally (UI surfaces n8nError below).
  }

  const { data, error } = await supabase
    .from('user_credentials')
    .upsert({
      user_id: user.id,
      project_id,
      tool_name,
      credential_type: credential_type || 'api_key',
      encrypted_value,
      n8n_credential_id,
      status: 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,project_id,tool_name' })
    .select('id, tool_name, credential_type, status, n8n_credential_id, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // n8nError nicht-fatal mitgeben — die UI/der Deploy kann den echten Grund anzeigen,
  // statt dass der Workflow später kryptisch „has issues and cannot be executed" wirft.
  return NextResponse.json({ credential: data, n8nError });
}

// GET /api/n8n/credentials?project_id=xxx — list (masked)
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project_id = req.nextUrl.searchParams.get('project_id');
  let query = supabase
    .from('user_credentials')
    .select('id, tool_name, credential_type, status, n8n_credential_id, created_at')
    .eq('user_id', user.id)
    .eq('status', 'active');

  if (project_id) query = query.eq('project_id', project_id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ credentials: data });
}

// DELETE /api/n8n/credentials/:id — revoke
export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();

  const { data: cred } = await supabase
    .from('user_credentials')
    .select('n8n_credential_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (cred?.n8n_credential_id) {
    await deleteN8nCredential(cred.n8n_credential_id).catch(console.error);
  }

  await supabase.from('user_credentials').update({ status: 'revoked' }).eq('id', id).eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}
