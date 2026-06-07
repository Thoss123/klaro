import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getExecutions, triggerTestExecution } from '@/lib/n8n';

// GET /api/n8n/executions?workflow_id=<db-id>
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workflow_id = req.nextUrl.searchParams.get('workflow_id');
  if (!workflow_id) return NextResponse.json({ error: 'workflow_id required' }, { status: 400 });

  const { data: wf } = await supabase
    .from('workflows')
    .select('n8n_workflow_id')
    .eq('id', workflow_id)
    .eq('user_id', user.id)
    .single();

  if (!wf?.n8n_workflow_id) return NextResponse.json({ executions: [] });

  const executions = await getExecutions(wf.n8n_workflow_id);
  return NextResponse.json({ executions });
}

// POST /api/n8n/executions — trigger test run
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { workflow_id } = await req.json();

  const { data: wf } = await supabase
    .from('workflows')
    .select('n8n_workflow_id, execution_count')
    .eq('id', workflow_id)
    .eq('user_id', user.id)
    .single();

  if (!wf?.n8n_workflow_id) return NextResponse.json({ error: 'Workflow not found or not deployed' }, { status: 404 });

  try {
    const result = await triggerTestExecution(wf.n8n_workflow_id);

    await supabase
      .from('workflows')
      .update({
        last_execution_at: new Date().toISOString(),
        execution_count: (wf.execution_count ?? 0) + 1,
      })
      .eq('id', workflow_id)
      .eq('user_id', user.id);

    if (result.status === 'error' || result.status === 'crashed') {
      return NextResponse.json(
        { error: result.error || 'Test-Ausführung fehlgeschlagen', ...result },
        { status: 422 },
      );
    }

    return NextResponse.json({
      executionId: result.executionId,
      status: result.status,
      via: result.via,
      ok: result.status === 'success',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
