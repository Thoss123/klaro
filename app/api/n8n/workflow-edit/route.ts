import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { mistralCompleteJson } from '@/lib/agents/llm';
import { runWorkflowEditor, workflowStructureChanged } from '@/lib/agents/workflow-editor';
import { isN8nMcpConfigured } from '@/lib/n8n-mcp-bridge';
import {
  buildMappingsFromWorkflow,
  resolveN8nWorkflowId,
  syncDeployedWorkflow,
} from '@/lib/n8n-mcp-sync';
import type { StepConfig, Workflow } from '@/lib/types';
import type { WorkflowEditorCoachContext } from '@/lib/workflow-editor-context';

/** POST /api/n8n/workflow-edit — chat-driven workflow structure + setup coaching + MCP-Sync. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    workflow: Workflow;
    message: string;
    step_configs?: Record<string, StepConfig>;
    workflow_db_id?: string;
  };

  if (!body.workflow?.steps || !body.message?.trim()) {
    return NextResponse.json({ error: 'workflow and message required' }, { status: 400 });
  }

  let complete;
  if (process.env.MISTRAL_API_KEY) {
    const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
    complete = mistralCompleteJson(client);
  }

  const mergedConfigs = { ...(body.step_configs ?? {}) };

  const coachContext: WorkflowEditorCoachContext = {
    ...body.coach_context,
    activeWorkflowId: body.coach_context?.activeWorkflowId ?? body.workflow.id,
  };

  const result = await runWorkflowEditor(
    {
      workflow: body.workflow,
      message: body.message.trim(),
      stepConfigs: mergedConfigs,
      coachContext,
    },
    complete,
  );

  if (body.workflow_db_id && result.changed && isN8nMcpConfigured()) {
    const n8nWorkflowId = await resolveN8nWorkflowId(body.workflow_db_id, user.id);
    if (n8nWorkflowId) {
      if (result.stepConfigUpdates) {
        for (const [id, partial] of Object.entries(result.stepConfigUpdates)) {
          mergedConfigs[id] = {
            configType: 'n8n',
            ...mergedConfigs[id],
            ...partial,
            parameters: { ...mergedConfigs[id]?.parameters, ...partial.parameters },
          };
        }
      }

      const structureChanged = workflowStructureChanged(body.workflow, result);
      try {
        const sync = await syncDeployedWorkflow({
          n8nWorkflowId,
          workflow: { ...body.workflow, steps: result.steps, edges: result.edges },
          stepConfigs: mergedConfigs,
          workflowName: body.workflow.title,
          structureChanged,
          changedStepIds: result.stepConfigUpdates
            ? Object.keys(result.stepConfigUpdates)
            : undefined,
        });
        result.mcpSynced = true;
        const parts: string[] = [];
        if (sync.restUpdated) parts.push('Graph in n8n aktualisiert');
        if (sync.mcpAppliedOperations > 0) {
          parts.push(`${sync.mcpAppliedOperations} Parameter in n8n gesetzt`);
        }
        if (parts.length) result.mcpSyncNote = parts.join(' · ');
      } catch (e: unknown) {
        console.error('[workflow-edit] MCP sync failed:', e);
        result.mcpSyncNote = e instanceof Error ? e.message : 'n8n-Sync fehlgeschlagen';
      }
    }
  }

  return NextResponse.json(result);
}
