import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { mistralCompleteJson } from '@/lib/agents/llm';
import { runWorkflowEditor, workflowStructureChanged } from '@/lib/agents/workflow-editor';
import { isN8nMcpConfigured } from '@/lib/n8n-mcp-bridge';
import { resolveN8nWorkflowId, syncDeployedWorkflow } from '@/lib/n8n-mcp-sync';
import type { StepConfig, Workflow } from '@/lib/types';
import type { WorkflowEditorChatTurn, WorkflowEditorCoachContext } from '@/lib/workflow-editor-context';

/**
 * POST /api/agents/workflow-editor — Editor-Chat-Endpoint (camelCase-Payload vom Modal).
 * Treibt Struktur-/Setup-Coaching, optionalen n8n-MCP-Sync, und liefert WorkflowEditResult.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    message: string;
    workflow: Workflow;
    stepConfigs?: Record<string, StepConfig>;
    workflowDbId?: string;
    coachContext?: WorkflowEditorCoachContext;
    history?: WorkflowEditorChatTurn[];
    runDataSummary?: string;
    ioContext?: string;
  };

  if (!body.workflow?.steps || !body.message?.trim()) {
    return NextResponse.json({ error: 'workflow and message required' }, { status: 400 });
  }

  let complete;
  if (process.env.MISTRAL_API_KEY) {
    const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
    complete = mistralCompleteJson(client, 'mistral-large-latest');
  }

  const mergedConfigs = { ...(body.stepConfigs ?? {}) };

  // Verlauf des Editor-Chats in den Coach-Kontext falten (wird im Prompt gerendert).
  const coachContext: WorkflowEditorCoachContext = {
    ...body.coachContext,
    activeWorkflowId: body.coachContext?.activeWorkflowId ?? body.workflow.id,
    editorHistory: body.history ?? body.coachContext?.editorHistory,
  };

  // Laufzeit-Hinweise (verfügbare Eingangsdaten + letzter Testlauf) als zusätzliche
  // Editor-Turn-Notiz anhängen, damit das LLM Expressions korrekt setzen / Fehler beheben kann.
  const runtimeHints = [
    body.ioContext?.trim() ? `Verfügbare Eingangsdaten je Schritt:\n${body.ioContext.trim()}` : '',
    body.runDataSummary?.trim() ? `Letzter Testlauf — Status & Output je Schritt (für die Datenfluss-Analyse):\n${body.runDataSummary.trim()}` : '',
  ].filter(Boolean).join('\n\n');
  if (runtimeHints) {
    coachContext.editorHistory = [
      ...(coachContext.editorHistory ?? []),
      { role: 'assistant', content: `[Kontext aus dem Editor]\n${runtimeHints}` },
    ];
  }

  const result = await runWorkflowEditor(
    {
      workflow: body.workflow,
      message: body.message.trim(),
      stepConfigs: mergedConfigs,
      coachContext,
    },
    complete,
  );

  // Nach Deploy: Änderungen live nach n8n spiegeln.
  if (body.workflowDbId && result.changed && isN8nMcpConfigured()) {
    const n8nWorkflowId = await resolveN8nWorkflowId(body.workflowDbId, user.id);
    if (n8nWorkflowId) {
      if (result.stepConfigUpdates) {
        for (const [id, partial] of Object.entries(result.stepConfigUpdates)) {
          mergedConfigs[id] = {
            ...mergedConfigs[id],
            ...partial,
            configType: 'n8n',
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
          changedStepIds: result.stepConfigUpdates ? Object.keys(result.stepConfigUpdates) : undefined,
          userId: user.id,
        });
        result.mcpSynced = true;
        const parts: string[] = [];
        if (sync.restUpdated) parts.push('Graph in n8n aktualisiert');
        if (sync.mcpAppliedOperations > 0) parts.push(`${sync.mcpAppliedOperations} Parameter in n8n gesetzt`);
        if (parts.length) result.mcpSyncNote = parts.join(' · ');
      } catch (e: unknown) {
        console.error('[agents/workflow-editor] MCP sync failed:', e);
        result.mcpSyncNote = e instanceof Error ? e.message : 'n8n-Sync fehlgeschlagen';
      }
    }
  }

  return NextResponse.json(result);
}
