import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { buildMappingsFromWorkflow } from '@/lib/n8n-mcp-sync';
import { validateWorkflowJsonWithSdk } from '@/lib/n8n-sdk-validate';
import { validateWorkflowForDeploy } from '@/lib/n8n-workflow-validate';
import { buildN8nWorkflow, type StepMapping } from '@/lib/workflow-generator';
import type { StepConfig, Workflow } from '@/lib/types';

/** POST /api/n8n/validate — Struktur + MCP-Checks vor Deploy. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    workflow: Workflow;
    step_configs?: Record<string, StepConfig>;
    workflow_db_id?: string;
    mappings?: StepMapping[];
    workflow_name?: string;
  };

  if (!body.workflow?.steps?.length) {
    return NextResponse.json({ error: 'workflow required' }, { status: 400 });
  }

  let n8nWorkflowId: string | undefined;
  if (body.workflow_db_id) {
    const { data: wf } = await supabase
      .from('workflows')
      .select('n8n_workflow_id')
      .eq('id', body.workflow_db_id)
      .eq('user_id', user.id)
      .maybeSingle();
    n8nWorkflowId = wf?.n8n_workflow_id ?? undefined;
  }

  const result = await validateWorkflowForDeploy(
    body.workflow,
    body.step_configs ?? {},
    n8nWorkflowId,
  );

  const mappings = body.mappings ?? buildMappingsFromWorkflow(body.workflow, body.step_configs ?? {});
  const workflowJson = buildN8nWorkflow(
    body.workflow,
    mappings,
    body.workflow_name || body.workflow.title,
  );
  const sdk = await validateWorkflowJsonWithSdk(
    workflowJson as { name: string; nodes: Array<{ name: string; type: string; typeVersion: number; parameters?: Record<string, unknown> }> },
  );

  if (!sdk.skipped) {
    result.errors.push(...sdk.errors);
    result.warnings.push(...sdk.warnings);
    if (!sdk.valid) result.valid = false;
  }

  return NextResponse.json({ ...result, sdkValidation: sdk.skipped ? null : sdk }, { status: result.valid ? 200 : 422 });
}
