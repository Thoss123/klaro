import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  buildMappingsFromWorkflow,
  resolveN8nWorkflowId,
  syncDeployedWorkflow,
} from '@/lib/n8n-mcp-sync';
import type { StepConfig, Workflow } from '@/lib/types';

/** POST /api/n8n/sync — deployed Workflow nach Panel/Canvas-Änderung zu n8n pushen. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    workflow_db_id: string;
    workflow: Workflow;
    step_configs?: Record<string, StepConfig>;
    workflow_name?: string;
    structure_changed?: boolean;
    changed_step_ids?: string[];
  };

  if (!body.workflow_db_id || !body.workflow?.steps) {
    return NextResponse.json({ error: 'workflow_db_id and workflow required' }, { status: 400 });
  }

  const n8nWorkflowId = await resolveN8nWorkflowId(body.workflow_db_id, user.id);
  if (!n8nWorkflowId) {
    return NextResponse.json({ error: 'Workflow nicht deployed' }, { status: 404 });
  }

  // Resolve n8n credential IDs for each tool
  const { data: creds } = await supabase
    .from('user_credentials')
    .select('tool_name, n8n_credential_id')
    .eq('user_id', user.id)
    .eq('status', 'active'); // project_id is optional but we can filter by it if available

  const credMap: Record<string, string> = {};
  for (const c of creds || []) {
    if (c.n8n_credential_id) credMap[c.tool_name] = c.n8n_credential_id;
  }

  const baseMappings = buildMappingsFromWorkflow(body.workflow, body.step_configs ?? {});
  const credentialMappings = baseMappings.map(m => ({
    ...m,
    credential_id: (m.tool && credMap[m.tool]) || (m.credential_type && credMap[m.credential_type]) || m.credential_id,
  }));

  try {
    const result = await syncDeployedWorkflow({
      n8nWorkflowId,
      workflow: body.workflow,
      stepConfigs: body.step_configs ?? {},
      workflowName: body.workflow_name || body.workflow.title,
      structureChanged: body.structure_changed ?? false,
      changedStepIds: body.changed_step_ids,
      credentialMappings,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Sync fehlgeschlagen';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
