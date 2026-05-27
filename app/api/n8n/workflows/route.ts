import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createN8nWorkflow, updateN8nWorkflow, activateN8nWorkflow, deactivateN8nWorkflow, deleteN8nWorkflow } from '@/lib/n8n';
import { buildN8nWorkflow, StepMapping } from '@/lib/workflow-generator';
import { Workflow } from '@/lib/types';

// POST /api/n8n/workflows — deploy a workflow
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { project_id, workflow, mappings, name, linked_use_case } = await req.json() as {
    project_id: string;
    workflow: Workflow;
    mappings: StepMapping[];
    name: string;
    linked_use_case?: string;
  };

  // Resolve n8n credential IDs for each tool
  const { data: creds } = await supabase
    .from('user_credentials')
    .select('tool_name, n8n_credential_id')
    .eq('user_id', user.id)
    .eq('project_id', project_id)
    .eq('status', 'active');

  const credMap: Record<string, string> = {};
  for (const c of creds || []) {
    if (c.n8n_credential_id) credMap[c.tool_name] = c.n8n_credential_id;
  }

  // Attach credential IDs to mappings
  const resolvedMappings = mappings.map(m => ({
    ...m,
    credential_id: credMap[m.tool] || m.credential_id,
  }));

  const workflowJson = buildN8nWorkflow(workflow, resolvedMappings, name);

  let n8n_workflow_id: string | null = null;
  try {
    const created = await createN8nWorkflow(workflowJson);
    n8n_workflow_id = created.id;
  } catch (e: any) {
    console.error('n8n deploy failed:', e.message);
    // Save as draft even if n8n fails
  }

  const { data, error } = await supabase
    .from('workflows')
    .insert({
      user_id: user.id,
      project_id,
      linked_use_case: linked_use_case || null,
      n8n_workflow_id,
      name,
      workflow_json: workflowJson,
      status: n8n_workflow_id ? 'inactive' : 'draft',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ workflow: data });
}

// GET /api/n8n/workflows?project_id=xxx
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const project_id = req.nextUrl.searchParams.get('project_id');
  let query = supabase.from('workflows').select('*').eq('user_id', user.id);
  if (project_id) query = query.eq('project_id', project_id);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ workflows: data });
}

// PATCH /api/n8n/workflows — activate/deactivate/update
export async function PATCH(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, action, workflow_json } = await req.json();
  const { data: wf } = await supabase.from('workflows').select('*').eq('id', id).eq('user_id', user.id).single();
  if (!wf) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let newStatus = wf.status;
  try {
    if (action === 'activate' && wf.n8n_workflow_id) {
      await activateN8nWorkflow(wf.n8n_workflow_id);
      newStatus = 'active';
    } else if (action === 'deactivate' && wf.n8n_workflow_id) {
      await deactivateN8nWorkflow(wf.n8n_workflow_id);
      newStatus = 'inactive';
    } else if (action === 'update' && wf.n8n_workflow_id && workflow_json) {
      await updateN8nWorkflow(wf.n8n_workflow_id, workflow_json);
    }
  } catch (e: any) {
    console.error('n8n PATCH failed:', e.message);
  }

  const { data } = await supabase
    .from('workflows')
    .update({ status: newStatus, workflow_json: workflow_json || wf.workflow_json, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  return NextResponse.json({ workflow: data });
}

// DELETE /api/n8n/workflows
export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  const { data: wf } = await supabase.from('workflows').select('n8n_workflow_id').eq('id', id).eq('user_id', user.id).single();
  if (wf?.n8n_workflow_id) await deleteN8nWorkflow(wf.n8n_workflow_id).catch(console.error);
  await supabase.from('workflows').delete().eq('id', id).eq('user_id', user.id);
  return NextResponse.json({ ok: true });
}
