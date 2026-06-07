import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { applyResolverToSteps, runNodeResolver } from '@/lib/agents/node-resolver';
import { getN8nCatalog, getNodeByName } from '@/lib/n8n-catalog';
import { defaultLinearEdges, withTriggerFirst } from '@/lib/workflow-graph';
import { getBuiltWorkflows, getWorkflowPlans } from '@/lib/workflow-plans';
import { shortLabel, shortWorkflowTitle } from '@/lib/short-label';
import type { CanvasData, Workflow } from '@/lib/types';

/** POST /api/n8n/build-workflow — turn a Phase-3 plan into a live n8n workflow on the canvas. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const projectId = typeof body.project_id === 'string' ? body.project_id : '';
  const workflowId = typeof body.workflow_id === 'string' ? body.workflow_id : '';
  const titleMatch = typeof body.title === 'string' ? body.title.trim().toLowerCase() : '';

  if (!projectId) {
    return NextResponse.json({ error: 'project_id required' }, { status: 400 });
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const { data: row, error: loadErr } = await supabase
    .from('project_canvas')
    .select('data')
    .eq('project_id', projectId)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });

  const canvas = (row?.data as CanvasData | undefined) ?? {
    pain_points: [],
    use_cases: [],
    workflows: [],
    documents: [],
    phase: 'umsetzung' as const,
  };

  const plans = getWorkflowPlans(canvas);
  const plan =
    plans.find(w => w.id === workflowId) ??
    (titleMatch
      ? plans.find(w => w.title.toLowerCase().includes(titleMatch) || titleMatch.includes(w.title.toLowerCase()))
      : undefined);

  if (!plan) {
    return NextResponse.json({ error: 'Workflow-Plan nicht gefunden' }, { status: 404 });
  }

  // Bereits gebaut? Nur zurückgeben, wenn der Build GESUND ist (jeder Schritt hat einen
  // echten Katalog-Node). Stale-/Halluzinations-Builds (z.B. metaBusinessSuite, ffmpeg aus
  // der alten LLM-Auflösung) werden neu aufgelöst statt kaputt zurückgegeben.
  const existing = getBuiltWorkflows(canvas).find(w => w.id === plan.id);
  if (existing) {
    const catalog = await getN8nCatalog();
    const healthy =
      (existing.steps?.length ?? 0) > 0 &&
      existing.steps.every(s => s.n8nType && getNodeByName(catalog, s.n8nType));
    if (healthy) {
      return NextResponse.json({ ok: true, workflow: existing, alreadyBuilt: true });
    }
    console.info(`[build-workflow] heile veralteten Build "${plan.title}" (Node nicht im Katalog) → neu auflösen`);
  }

  const linkedUc = canvas.use_cases?.find(u => u.linked_pain_point === plan.linked_pain_point);
  const linkedPp = canvas.pain_points?.find(p => p.id === plan.linked_pain_point);

  // Heuristik-only beim Build → INSTANT (keine LLM-Latenz, keine halluzinierten Nodes).
  // Jeder Schritt bekommt garantiert einen echten Katalog-Node. Verfeinern kann der
  // Nutzer danach im Editor (Node wechseln) oder per Editor-Chat.
  const { results } = await runNodeResolver({
    steps: plan.steps,
    context: {
      useCaseTitle: linkedUc?.title ?? plan.title,
      painPoint: linkedPp?.title,
      tools: linkedUc?.tools,
    },
  });

  // 1. Auflösen: jeder Schritt bekommt garantiert einen echten n8n-Node.
  const appliedSteps = applyResolverToSteps(plan.steps, results, { overwrite: true }).map(s => ({
    ...s,
    // Original (langer, deutscher) Plan-Text als "was macht dieser Schritt" sichern,
    // bevor das Label fürs Node-Display gekürzt wird.
    note: s.note ?? s.label,
    label: shortLabel(s.label, { n8nType: s.n8nType }),
  }));
  // 2. Linearer Default-Graph, dann Trigger garantiert erster + verbunden.
  const linear = defaultLinearEdges(appliedSteps);
  const { steps: connectedSteps, edges: connectedEdges } = withTriggerFirst(appliedSteps, linear);

  const built: Workflow = {
    ...plan,
    title: shortWorkflowTitle(plan.title),
    steps: connectedSteps.map((s, i) => ({
      ...s,
      position: s.position ?? { x: 80 + i * 240, y: 160 },
    })),
    edges: connectedEdges,
  };

  // Vorhandenen Build mit gleicher id ersetzen (Heilung), sonst anhängen.
  const others = getBuiltWorkflows(canvas).filter(w => w.id !== plan.id);
  const nextCanvas: CanvasData = {
    ...canvas,
    workflow_plans: plans,
    workflows: [...others, built],
  };

  const { error: saveErr } = await supabase.from('project_canvas').upsert(
    {
      project_id: projectId,
      data: nextCanvas,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id' },
  );
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, workflow: built, canvas: nextCanvas });
}
