import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { applyResolverToSteps, runNodeResolver } from '@/lib/agents/node-resolver';
import { getN8nCatalog, getNodeByName, getCatalogIndex } from '@/lib/n8n-catalog';
import { ensureRequiredSubNodes, splitSharedAiSubNodes } from '@/lib/ai-subnodes';
import { defaultLinearEdges, layoutStepPositions, withTriggerFirst } from '@/lib/workflow-graph';
import { expandPatterns } from '@/lib/workflow-expand';
import { getBuiltWorkflows, getWorkflowPlans } from '@/lib/workflow-plans';
import { shortLabel, shortWorkflowTitle } from '@/lib/short-label';
import type { CanvasData, Workflow, WorkflowStep } from '@/lib/types';

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
  let plan =
    plans.find(w => w.id === workflowId) ??
    (titleMatch
      ? plans.find(w => w.title.toLowerCase().includes(titleMatch) || titleMatch.includes(w.title.toLowerCase()))
      : undefined);

  // Ad-hoc-Workflow: der Coach kann in Phase 4 einen NEUEN Workflow ohne Plan/Pain-Point
  // bauen, indem er Titel + Schritte mitschickt. So funktioniert „bau mir einen Workflow für X".
  let isAdHoc = false;
  if (!plan) {
    const providedSteps = Array.isArray(body.steps) ? body.steps : [];
    if (providedSteps.length > 0 && (body.title || workflowId)) {
      isAdHoc = true;
      plan = {
        id: workflowId || `wf_custom_${Date.now()}`,
        title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'Neuer Workflow',
        linked_pain_point: typeof body.linked_pain_point === 'string' ? body.linked_pain_point : '',
        steps: providedSteps
          .filter((s: { label?: string }) => s && typeof s.label === 'string' && s.label.trim())
          .map((s: { id?: string; label: string; type?: string }, i: number) => ({
            id: s.id || `s${i + 1}`,
            label: s.label.trim(),
            type: (s.type as WorkflowStep['type']) || (i === 0 ? 'trigger' : 'action'),
          })),
      };
    }
  }

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
  // 2. Basis-Graph: vom Plan gelieferte Edges (Coach) nutzen, sonst linear.
  const validPlanEdges = Array.isArray(plan.edges)
    ? plan.edges.filter(e => appliedSteps.some(s => s.id === e.source) && appliedSteps.some(s => s.id === e.target))
    : [];
  const baseEdges = validPlanEdges.length ? validPlanEdges : defaultLinearEdges(appliedSteps);

  // 2b. Muster deterministisch expandieren: Human-in-the-Loop → sendAndWait → IF → Loopback;
  //     „Durchreich"-Set-Nodes entfernen. Danach Trigger garantiert erster + verbunden.
  const expanded = expandPatterns(appliedSteps, baseEdges);
  const { steps: connectedSteps, edges: connectedEdges } = withTriggerFirst(expanded.steps, expanded.edges);

  // 3. Echte Agent-Struktur: jedem AI-Agent/Chain seinen Pflicht-Chat-Model-Sub-Node anhängen
  // (Mistral-Default). Ohne Chat Model ist ein Agent-Node nicht ausführbar.
  const index = await getCatalogIndex();
  const required = ensureRequiredSubNodes(connectedSteps, connectedEdges, index);
  // 3b. Jeder Agent/Chain bekommt sein EIGENES Chat Model — kein geteiltes Sub-Node.
  const { steps: withSubs, edges: withSubEdges } = splitSharedAiSubNodes(required.steps, required.edges);

  // 4. Layout: Hauptkette horizontal, Sub-Nodes unter ihrem Parent.
  const positioned = layoutStepPositions(withSubs, withSubEdges, { force: true });

  const built: Workflow = {
    ...plan,
    title: shortWorkflowTitle(plan.title),
    steps: positioned,
    edges: withSubEdges,
  };

  // Vorhandenen Build mit gleicher id ersetzen (Heilung), sonst anhängen.
  const others = getBuiltWorkflows(canvas).filter(w => w.id !== plan.id);
  // Ad-hoc-Plan in workflow_plans aufnehmen, damit er erhalten bleibt (sonst nur die plans-Liste).
  const nextPlans = isAdHoc && !plans.some(p => p.id === plan!.id) ? [...plans, plan] : plans;
  const nextCanvas: CanvasData = {
    ...canvas,
    workflow_plans: nextPlans,
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
