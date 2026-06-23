import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  isN8nMcpConfigured,
  mcpGetWorkflowDetails,
  mcpRunWorkflowTest,
  mcpSearchWorkflows,
  n8nMcpListTools,
} from '@/lib/n8n-mcp-bridge';

/** GET /api/n8n/mcp — MCP health (configured + tool list). */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isN8nMcpConfigured()) {
    return NextResponse.json({
      configured: false,
      ok: false,
      message: 'N8N_MCP_URL / N8N_MCP_TOKEN nicht gesetzt oder MOCK_N8N=true',
    });
  }

  try {
    const tools = await n8nMcpListTools();
    return NextResponse.json({
      configured: true,
      ok: tools.length > 0,
      toolCount: tools.length,
      tools,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'MCP-Verbindung fehlgeschlagen';
    return NextResponse.json({ configured: true, ok: false, error: message }, { status: 502 });
  }
}

/**
 * POST /api/n8n/mcp
 * Body: { action: 'test' | 'details' | 'search', workflow_id?: string, query?: string }
 * workflow_id = Axantilo DB id (workflows table), resolved to n8n_workflow_id.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isN8nMcpConfigured()) {
    return NextResponse.json({ error: 'n8n MCP nicht konfiguriert' }, { status: 503 });
  }

  const body = await req.json() as {
    action?: string;
    workflow_id?: string;
    n8n_workflow_id?: string;
    query?: string;
  };

  const action = body.action || 'test';

  if (action === 'search') {
    const result = await mcpSearchWorkflows(body.query?.trim() || undefined);
    return NextResponse.json(result);
  }

  let n8nWorkflowId = body.n8n_workflow_id?.trim() || '';

  if (!n8nWorkflowId && body.workflow_id) {
    const { data: wf } = await supabase
      .from('workflows')
      .select('n8n_workflow_id')
      .eq('id', body.workflow_id)
      .eq('user_id', user.id)
      .single();

    if (!wf?.n8n_workflow_id) {
      return NextResponse.json({ error: 'Workflow nicht deployed' }, { status: 404 });
    }
    n8nWorkflowId = wf.n8n_workflow_id;
  }

  if (!n8nWorkflowId) {
    return NextResponse.json({ error: 'workflow_id oder n8n_workflow_id erforderlich' }, { status: 400 });
  }

  if (action === 'details') {
    const details = await mcpGetWorkflowDetails(n8nWorkflowId);
    return NextResponse.json(details);
  }

  if (action === 'test') {
    const result = await mcpRunWorkflowTest(n8nWorkflowId);
    if (result.status === 'error' || result.status === 'crashed') {
      return NextResponse.json(
        { ...result, ok: false },
        { status: 422 },
      );
    }
    return NextResponse.json({ ...result, ok: result.status === 'success' });
  }

  return NextResponse.json({ error: `Unbekannte action: ${action}` }, { status: 400 });
}
