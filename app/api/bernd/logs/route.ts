import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { requireUser, assertProjectOwner, accessDenied } from '@/lib/access-control';
import { getExecutions } from '@/lib/n8n';

/**
 * GET /api/bernd/logs?projectId=<id>[&include=messages]
 *
 * Listet die deployten Workflows eines Projekts + je Flow die letzten Executions
 * (lib/n8n.ts getExecutions), humanisiert für die Dashboard-Ansicht "Logs & Workflows"
 * (Architekturplan §5 Screen 3d): kein roher Node-Graph, nur { flow_label, status, when, error }.
 *
 * Mit `include=messages` liefert die Route zusätzlich `activity`: eine gemischte, nach Zeit
 * sortierte Aktivitäten-Leiste aus `bernd_messages` (Router-Konversation, beide Richtungen)
 * und den zuletzt ABGESCHLOSSENEN Freigaben (`agent_pending_actions` status sent/cancelled) —
 * additive Erweiterung fürs Dashboard-Cockpit (WP7), ohne den bestehenden Vertrag zu ändern.
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

interface ActivityEvent {
  kind: 'message' | 'approval';
  who: string;
  what: string;
  when: string;
}

const ACTIVITY_LIMIT = 25;
const ACTIVITY_TEXT_PREVIEW = 140;

function approvalSubject(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'subject' in payload) {
    const subject = (payload as { subject?: unknown }).subject;
    if (typeof subject === 'string' && subject.trim()) return ` – ${subject.trim()}`;
  }
  return '';
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

  if (req.nextUrl.searchParams.get('include') !== 'messages') {
    return NextResponse.json({ flows });
  }

  const [messagesRes, approvalsRes] = await Promise.all([
    supabase
      .from('bernd_messages')
      .select('id, direction, content, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(ACTIVITY_LIMIT),
    supabase
      .from('agent_pending_actions')
      .select('id, payload, status, updated_at')
      .eq('project_id', projectId)
      .in('status', ['sent', 'cancelled'])
      .order('updated_at', { ascending: false })
      .limit(ACTIVITY_LIMIT),
  ]);

  const messageRows = (messagesRes.data ?? []) as Array<{
    id: string;
    direction: string;
    content: string | null;
    created_at: string;
  }>;
  const approvalRows = (approvalsRes.data ?? []) as Array<{
    id: string;
    payload: unknown;
    status: string;
    updated_at: string;
  }>;

  const messageEvents: ActivityEvent[] = messageRows.map((m) => ({
    kind: 'message',
    who: m.direction === 'in' ? 'Betrieb' : 'Bernd',
    what: (m.content ?? '').slice(0, ACTIVITY_TEXT_PREVIEW),
    when: m.created_at,
  }));

  const approvalEvents: ActivityEvent[] = approvalRows.map((a) => ({
    kind: 'approval',
    who: 'Bernd',
    what:
      a.status === 'sent'
        ? `Freigabe gesendet${approvalSubject(a.payload)}`
        : `Freigabe abgelehnt${approvalSubject(a.payload)}`,
    when: a.updated_at,
  }));

  const activity = [...messageEvents, ...approvalEvents]
    .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
    .slice(0, ACTIVITY_LIMIT);

  return NextResponse.json({ flows, activity });
}
