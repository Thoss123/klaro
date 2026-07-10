import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { requireUser, assertProjectOwner, accessDenied } from '@/lib/access-control';
import { getExecutions } from '@/lib/n8n';

/**
 * GET /api/bernd/logs?projectId=<id>
 *
 * Listet die deployten Workflows eines Projekts + je Flow die letzten Executions
 * (lib/n8n.ts getExecutions), humanisiert für die Dashboard-Ansicht "Logs & Workflows"
 * (Architekturplan §5 Screen 3d): kein roher Node-Graph, nur { flow_label, status, when, error }.
 */

interface HumanRun {
  flow_label: string;
  status: 'ok' | 'fehler' | 'läuft' | 'unbekannt';
  when: string;
  error?: string;
}

interface FlowSummary {
  workflow_id: string;
  n8n_workflow_id: string | null;
  name: string;
  active: boolean;
  last_execution_at: string | null;
  execution_count: number;
  runs: HumanRun[];
}

function humanizeStatus(status: string): HumanRun['status'] {
  if (status === 'success') return 'ok';
  if (status === 'error' || status === 'crashed') return 'fehler';
  if (status === 'running' || status === 'waiting') return 'läuft';
  return 'unbekannt';
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const auth = await requireUser(supabase);
  if (!auth.ok) return accessDenied(auth);

  const projectId = req.nextUrl.searchParams.get('projectId') ?? '';
  const owner = await assertProjectOwner(supabase, auth.userId, projectId);
  if (!owner.ok) return accessDenied(owner);

  const { data: workflows, error } = await supabase
    .from('workflows')
    .select('id, n8n_workflow_id, name, status, last_execution_at, execution_count')
    .eq('project_id', projectId)
    .eq('user_id', auth.userId);

  if (error) {
    return NextResponse.json({ error: 'Workflows konnten nicht geladen werden' }, { status: 500 });
  }

  const rows = (workflows ?? []) as Array<{
    id: string;
    n8n_workflow_id: string | null;
    name: string | null;
    status: string | null;
    last_execution_at: string | null;
    execution_count: number | null;
  }>;

  const flows: FlowSummary[] = await Promise.all(
    rows.map(async (wf) => {
      let runs: HumanRun[] = [];
      if (wf.n8n_workflow_id) {
        try {
          const executions = await getExecutions(wf.n8n_workflow_id);
          runs = executions.map((ex) => ({
            flow_label: wf.name || 'Unbenannter Flow',
            status: humanizeStatus(ex.status),
            when: ex.stoppedAt || ex.startedAt,
            error: ex.status === 'error' ? 'Ausführung fehlgeschlagen' : undefined,
          }));
        } catch (e: unknown) {
          console.warn('[bernd/logs] getExecutions failed:', e instanceof Error ? e.message : String(e));
        }
      }

      return {
        workflow_id: wf.id,
        n8n_workflow_id: wf.n8n_workflow_id,
        name: wf.name || 'Unbenannter Flow',
        active: wf.status === 'active',
        last_execution_at: wf.last_execution_at,
        execution_count: wf.execution_count ?? 0,
        runs,
      };
    }),
  );

  return NextResponse.json({ flows });
}
