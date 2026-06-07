import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createN8nWorkflow, updateN8nWorkflow, activateN8nWorkflow, deactivateN8nWorkflow, deleteN8nWorkflow } from '@/lib/n8n';
import { isN8nMcpConfigured, mcpRunWorkflowTest } from '@/lib/n8n-mcp-bridge';
import { buildMappingsFromWorkflow } from '@/lib/n8n-mcp-sync';
import { validateWorkflowForDeploy } from '@/lib/n8n-workflow-validate';
import { validateWorkflowJsonWithSdk } from '@/lib/n8n-sdk-validate';
import { buildN8nWorkflow, StepMapping } from '@/lib/workflow-generator';
import { Workflow, StepConfig } from '@/lib/types';

// POST /api/n8n/workflows — deploy a workflow
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { project_id, workflow, mappings, name, linked_use_case, step_configs, skip_validate } = await req.json() as {
    project_id: string;
    workflow: Workflow;
    mappings: StepMapping[];
    name: string;
    linked_use_case?: string;
    step_configs?: Record<string, StepConfig>;
    skip_validate?: boolean;
  };

  if (!skip_validate) {
    const validation = await validateWorkflowForDeploy(workflow, step_configs ?? {});
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Workflow-Validierung fehlgeschlagen', validation },
        { status: 422 },
      );
    }
  }

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

  // Attach credential IDs to mappings (by tool_name or credential_type)
  const resolvedMappings = mappings.map(m => ({
    ...m,
    credential_id: (m.tool && credMap[m.tool]) || (m.credential_type && credMap[m.credential_type]) || m.credential_id,
  }));

  const workflowJson = buildN8nWorkflow(workflow, resolvedMappings, name);

  const sdkValidation = await validateWorkflowJsonWithSdk(
    workflowJson as { name: string; nodes: Array<{ name: string; type: string; typeVersion: number; parameters?: Record<string, unknown> }> },
  );
  if (!sdkValidation.skipped && !sdkValidation.valid) {
    return NextResponse.json(
      {
        error: 'SDK-Validierung fehlgeschlagen',
        validation: { errors: sdkValidation.errors, warnings: sdkValidation.warnings },
      },
      { status: 422 },
    );
  }

  let n8n_workflow_id: string | null = null;
  let mcpTest: { status?: string; error?: string } | null = null;
  try {
    const created = await createN8nWorkflow(workflowJson);
    n8n_workflow_id = created.id;

    if (isN8nMcpConfigured() && n8n_workflow_id) {
      try {
        mcpTest = await mcpRunWorkflowTest(n8n_workflow_id);
      } catch (e: unknown) {
        mcpTest = { status: 'error', error: e instanceof Error ? e.message : 'MCP-Test fehlgeschlagen' };
      }
    }
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

  return NextResponse.json({ workflow: data, mcpTest, sdkValidation: sdkValidation.skipped ? null : sdkValidation });
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

  const { id, action, workflow_json, workflow, step_configs, mappings, name } = await req.json() as {
    id: string;
    action?: string;
    workflow_json?: object;
    workflow?: Workflow;
    step_configs?: Record<string, StepConfig>;
    mappings?: StepMapping[];
    name?: string;
  };
  const { data: wf } = await supabase.from('workflows').select('*').eq('id', id).eq('user_id', user.id).single();
  if (!wf) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let newStatus = wf.status;
  let nextWorkflowJson = workflow_json || wf.workflow_json;

  if (action === 'update' && workflow && wf.n8n_workflow_id) {
    const validation = await validateWorkflowForDeploy(workflow, step_configs ?? {});
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Workflow-Validierung fehlgeschlagen', validation },
        { status: 422 },
      );
    }

    const { data: creds } = await supabase
      .from('user_credentials')
      .select('tool_name, n8n_credential_id')
      .eq('user_id', user.id)
      .eq('project_id', wf.project_id)
      .eq('status', 'active');

    const credMap: Record<string, string> = {};
    for (const c of creds || []) {
      if (c.n8n_credential_id) credMap[c.tool_name] = c.n8n_credential_id;
    }

    const baseMappings = mappings ?? buildMappingsFromWorkflow(workflow, step_configs ?? {});
    const resolvedMappings = baseMappings.map(m => ({
      ...m,
      credential_id: (m.tool && credMap[m.tool]) || (m.credential_type && credMap[m.credential_type]) || m.credential_id,
    }));
    nextWorkflowJson = buildN8nWorkflow(workflow, resolvedMappings, name || wf.name);

    const sdkValidation = await validateWorkflowJsonWithSdk(
      nextWorkflowJson as { name: string; nodes: Array<{ name: string; type: string; typeVersion: number; parameters?: Record<string, unknown> }> },
    );
    if (!sdkValidation.skipped && !sdkValidation.valid) {
      return NextResponse.json(
        {
          error: 'SDK-Validierung fehlgeschlagen',
          validation: { errors: sdkValidation.errors, warnings: sdkValidation.warnings },
        },
        { status: 422 },
      );
    }
  }

  try {
    if (action === 'activate' && wf.n8n_workflow_id) {
      await activateN8nWorkflow(wf.n8n_workflow_id);
      newStatus = 'active';
    } else if (action === 'deactivate' && wf.n8n_workflow_id) {
      await deactivateN8nWorkflow(wf.n8n_workflow_id);
      newStatus = 'inactive';
    } else if (action === 'update' && wf.n8n_workflow_id && nextWorkflowJson) {
      await updateN8nWorkflow(wf.n8n_workflow_id, nextWorkflowJson);
    }
  } catch (e: any) {
    console.error('n8n PATCH failed:', e.message);
  }

  const { data } = await supabase
    .from('workflows')
    .update({
      status: newStatus,
      workflow_json: nextWorkflowJson,
      updated_at: new Date().toISOString(),
      ...(name ? { name } : {}),
    })
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
