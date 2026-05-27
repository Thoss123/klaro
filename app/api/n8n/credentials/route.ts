import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { encrypt, mask } from '@/lib/encryption';
import { createN8nCredential, deleteN8nCredential } from '@/lib/n8n';
import { CREDENTIAL_TYPE } from '@/lib/workflow-generator';

// POST /api/n8n/credentials — store + create credential in n8n
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { project_id, tool_name, credential_type, value } = await req.json();
  if (!project_id || !tool_name || !value) {
    return NextResponse.json({ error: 'project_id, tool_name, value required' }, { status: 400 });
  }

  const encrypted_value = encrypt(value);

  // Create credential in n8n
  let n8n_credential_id: string | null = null;
  try {
    const n8nType = CREDENTIAL_TYPE[tool_name];
    if (n8nType) {
      const cred = await createN8nCredential({
        name: `${user.id.slice(0, 8)}-${tool_name}`,
        type: n8nType,
        data: { apiKey: value }, // simplified — real OAuth flows differ per tool
      });
      n8n_credential_id = cred.id;
    }
  } catch (e) {
    console.error('n8n credential creation failed:', e);
    // Continue — credential is still saved locally
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

  return NextResponse.json({ credential: data });
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
