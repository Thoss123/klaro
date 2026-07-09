import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { ensureDataLayer } from '@/lib/data-layer';
import { createN8nWorkflow, updateN8nWorkflow, activateN8nWorkflow, deactivateN8nWorkflow, deleteN8nWorkflow } from '@/lib/n8n';
import { isN8nMcpConfigured, mcpRunWorkflowTest } from '@/lib/n8n-mcp-bridge';
import { buildMappingsFromWorkflow } from '@/lib/n8n-mcp-sync';
import { validateWorkflowForDeploy } from '@/lib/n8n-workflow-validate';
import { validateWorkflowJsonWithSdk } from '@/lib/n8n-sdk-validate';
import { buildN8nWorkflow, StepMapping } from '@/lib/workflow-generator';
import { Workflow, StepConfig } from '@/lib/types';
import { buildCentralCredMap } from '@/lib/central-credentials';
import { AXANTILO_AI_TOOL, ensureAxantiloLlmCredential, isAxantiloAiTool } from '@/lib/axantilo-llm-credential';
import { getRequestOrigin } from '@/lib/app-origin';

// POST /api/n8n/workflows — deploy a workflow
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { project_id, workflow, mappings, name, linked_use_case, step_configs, skip_validate, canvas_workflow_id } = await req.json() as {
    project_id: string;
    workflow: Workflow;
    mappings: StepMapping[];
    name: string;
    linked_use_case?: string;
    step_configs?: Record<string, StepConfig>;
    skip_validate?: boolean;
    canvas_workflow_id?: string;
  };

  // Auto-provision data layer if not yet set up (idempotent, fire-and-forget)
  ensureDataLayer(user.id, project_id).catch(() => {});

  // Enthält der Workflow einen Schritt mit dem Axantilo-Chat-Model (axantilo_ai) → die
  // per-Projekt-n8n-Credential dafür sicherstellen (idempotent). Muss VOR dem Mapping
  // fertig sein, damit credMap['axantilo_ai'] unten gesetzt werden kann.
  const needsAxantiloAiCred = (workflow.steps ?? []).some(s => isAxantiloAiTool(s.tool));
  const axantiloAiCredId = needsAxantiloAiCred
    ? await ensureAxantiloLlmCredential(supabase, user.id, project_id, getRequestOrigin(req))
    : null;

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

  // Central credentials (Resend SMTP, Twilio, …) come first — user_credentials can override.
  const credMap: Record<string, string> = { ...buildCentralCredMap() };
  if (axantiloAiCredId) credMap[AXANTILO_AI_TOOL] = axantiloAiCredId;
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
  // skip_validate (Auto-Deploy): trotzdem deployen — Fehler fehlender Config kommen beim Testen.
  if (!skip_validate && !sdkValidation.skipped && !sdkValidation.valid) {
    return NextResponse.json(
      {
        error: 'SDK-Validierung fehlgeschlagen',
        validation: { errors: sdkValidation.errors, warnings: sdkValidation.warnings },
      },
      { status: 422 },
    );
  }

  // Idempotenz: existiert für diesen Canvas-Workflow schon ein Deploy → wiederverwenden
  // (n8n-Workflow UPDATEN statt neu erstellen), damit keine Duplikate entstehen.
  let existing: { id: string; n8n_workflow_id: string | null; status: string | null } | null = null;
  if (canvas_workflow_id) {
    const { data: existingRow } = await supabase
      .from('workflows')
      .select('id, n8n_workflow_id, status')
      .eq('user_id', user.id)
      .eq('project_id', project_id)
      .eq('canvas_workflow_id', canvas_workflow_id)
      .maybeSingle();
    existing = existingRow ?? null;
  }

  let n8n_workflow_id: string | null = existing?.n8n_workflow_id ?? null;
  let mcpTest: { status?: string; error?: string } | null = null;
  let deployError: string | null = null;
  try {
    if (n8n_workflow_id) {
      // Bereits deployt → bestehenden n8n-Workflow aktualisieren (kein neuer!).
      await updateN8nWorkflow(n8n_workflow_id, workflowJson);
    } else {
      const created = await createN8nWorkflow(workflowJson);
      n8n_workflow_id = created.id;
    }

    if (isN8nMcpConfigured() && n8n_workflow_id) {
      try {
        mcpTest = await mcpRunWorkflowTest(n8n_workflow_id);
      } catch (e: unknown) {
        mcpTest = { status: 'error', error: e instanceof Error ? e.message : 'MCP-Test fehlgeschlagen' };
      }
    }
  } catch (e: unknown) {
    // WICHTIG: Fehler NICHT verschlucken. Vorher wurde still ein „draft" gespeichert,
    // die UI dachte „deployed", und der Testlauf schlug mit „not deployed" fehl.
    deployError = e instanceof Error ? e.message : 'n8n-Deploy fehlgeschlagen';
    console.error('n8n deploy failed:', deployError);
  }

  // Bestehende Zeile updaten statt neu einfügen (sonst DB-Duplikat trotz n8n-Reuse).
  const row = {
    user_id: user.id,
    project_id,
    linked_use_case: linked_use_case || null,
    canvas_workflow_id: canvas_workflow_id || null,
    n8n_workflow_id,
    name,
    workflow_json: workflowJson,
    // Beim Wiederverwenden den bestehenden Status (z. B. 'active') NICHT überschreiben.
    status: n8n_workflow_id ? (existing?.status ?? 'inactive') : 'draft',
  };
  const { data, error } = existing
    ? await supabase.from('workflows').update({ ...row, updated_at: new Date().toISOString() }).eq('id', existing.id).select().single()
    : await supabase.from('workflows').insert(row).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // n8n hat den Workflow NICHT angenommen → klaren Fehler zurückgeben (502), nicht „Erfolg".
  if (!n8n_workflow_id) {
    return NextResponse.json(
      {
        error: `n8n hat den Workflow nicht angenommen: ${deployError ?? 'unbekannter Grund'}`,
        deployed: false,
        workflow: data,
        workflowJson,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ workflow: data, deployed: true, mcpTest, sdkValidation: sdkValidation.skipped ? null : sdkValidation });
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

    const credMap: Record<string, string> = { ...buildCentralCredMap() };
    const needsAxantiloAiCred = (workflow.steps ?? []).some(s => isAxantiloAiTool(s.tool));
    if (needsAxantiloAiCred) {
      const axantiloAiCredId = await ensureAxantiloLlmCredential(supabase, user.id, wf.project_id, getRequestOrigin(req));
      if (axantiloAiCredId) credMap[AXANTILO_AI_TOOL] = axantiloAiCredId;
    }
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
  } catch (e: unknown) {
    console.error('n8n PATCH failed:', e instanceof Error ? e.message : e);
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
