/**
 * Work Package G — baut die vier coach-gebauten Landing-Page-Referenz-Workflows
 * (Lead-Qualifizierung, Gesprächsnotizen, Berichte & Reports, Datenpflege) über die ECHTE
 * Build-Pipeline (NodeResolver → applyResolverToSteps → expandPatterns → withTriggerFirst →
 * ensureRequiredSubNodes → splitSharedAiSubNodes → layoutStepPositions → buildN8nWorkflow —
 * derselbe Pfad wie app/api/n8n/build-workflow/route.ts) und deployt sie NAMENTLICH als
 * "AXANTILO-REF: <Titel>" in die geteilte n8n-Instanz.
 *
 * ACHTUNG — dieses Skript verändert die LIVE n8n-Instanz (idempotentes PUT/POST auf
 * /workflows). NICHT versehentlich ausführen. MOCK_N8N=true überspringt den Deploy komplett
 * (nur lokaler Trockenlauf: Pipeline + JSON-Ausgabe in der Konsole, kein n8n-Call).
 *
 * Aufruf (nur explizit, mit echten Env-Vars aus .env.local):
 *   npx tsx scripts/build-reference-workflows.ts --deploy
 *
 * Ohne --deploy läuft nur ein Trockenlauf (Pipeline + Validierung, kein Netzwerk-Call an n8n).
 * Mit MOCK_N8N=true in .env.local wird selbst bei --deploy nicht wirklich deployt (n8n() wirft).
 */
import fs from 'fs';
import path from 'path';

// .env.local manuell laden (kein dotenv im Projekt) — wie scripts/build-agent-workflows.ts.
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const DEPLOY = process.argv.includes('--deploy');
const BASE = process.env.N8N_API_URL!;
const KEY = process.env.N8N_API_KEY!;
const REF_PREFIX = 'AXANTILO-REF: ';

const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'plans');
const FIXTURE_FILES = [
  'lead-qualifizierung.json',
  'gespraechsnotizen.json',
  'berichte-reports.json',
  'datenpflege.json',
];

async function n8n<T = Record<string, unknown>>(p: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${p}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-N8N-API-KEY': KEY, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`n8n ${init.method || 'GET'} ${p} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function upsertByName(wf: { name: string } & Record<string, unknown>): Promise<string> {
  const list = await n8n<{ data: Array<{ id: string; name: string }> }>(`/workflows?limit=200`);
  const existing = list.data.find(w => w.name === wf.name);
  if (existing) {
    await n8n(`/workflows/${existing.id}`, { method: 'PUT', body: JSON.stringify(wf) });
    return existing.id;
  }
  const created = await n8n<{ id: string }>(`/workflows`, { method: 'POST', body: JSON.stringify(wf) });
  return created.id;
}

async function main() {
  // Dynamische Imports NACH dem .env-Load, damit lib/n8n-catalog.ts MOCK_N8N/N8N_API_URL sieht.
  const { mergeWorkflowPlanIntoCanvas } = await import('../lib/merge-workflow-plan');
  const { applyResolverToSteps, runNodeResolver } = await import('../lib/agents/node-resolver');
  const { defaultLinearEdges, layoutStepPositions, withTriggerFirst } = await import('../lib/workflow-graph');
  const { expandPatterns } = await import('../lib/workflow-expand');
  const { ensureRequiredSubNodes, splitSharedAiSubNodes } = await import('../lib/ai-subnodes');
  const { buildN8nWorkflow } = await import('../lib/workflow-generator');
  const { validateWorkflowForDeploy } = await import('../lib/n8n-workflow-validate');
  const { getCatalogIndex } = await import('../lib/n8n-catalog');
  const { buildCentralCredMap } = await import('../lib/central-credentials');
  type StepMappingT = import('../lib/workflow-generator').StepMapping;
  type WorkflowT = import('../lib/types').Workflow;
  type CanvasDataT = import('../lib/types').CanvasData;
  type WorkflowPlanInputT = import('../lib/merge-workflow-plan').WorkflowPlanInput;

  console.log('MOCK_N8N =', process.env.MOCK_N8N, '| BASE =', BASE, '| DEPLOY =', DEPLOY);

  const credMap = buildCentralCredMap(); // zentrale Credentials (Resend SMTP, Twilio, Workspace-Token)

  for (const file of FIXTURE_FILES) {
    const plan = JSON.parse(
      fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8'),
    ) as WorkflowPlanInputT;

    const emptyCanvas: CanvasDataT = {
      pain_points: [],
      use_cases: [],
      workflows: [],
      documents: [],
      phase: 'analyse',
    };
    const merged = mergeWorkflowPlanIntoCanvas(emptyCanvas, plan);
    if (!merged) throw new Error(`Ungültiger Plan-Fixture: ${file}`);
    const draft = merged.canvas.workflow_plans![0] as WorkflowT;

    // ── Dieselbe Pipeline wie app/api/n8n/build-workflow/route.ts (POST-Handler) ──
    const { results } = await runNodeResolver({ steps: draft.steps, context: { useCaseTitle: draft.title } });
    const appliedSteps = applyResolverToSteps(draft.steps, results, { overwrite: true });
    const baseEdges = draft.edges && draft.edges.length ? draft.edges : defaultLinearEdges(appliedSteps);
    const expanded = expandPatterns(appliedSteps, baseEdges);
    const { steps: connectedSteps, edges: connectedEdges } = withTriggerFirst(expanded.steps, expanded.edges);
    const index = await getCatalogIndex();
    const required = ensureRequiredSubNodes(connectedSteps, connectedEdges, index);
    const { steps: withSubs, edges: withSubEdges } = splitSharedAiSubNodes(required.steps, required.edges);
    const positioned = layoutStepPositions(withSubs, withSubEdges, { force: true });
    const built: WorkflowT = { ...draft, steps: positioned, edges: withSubEdges };

    const validation = await validateWorkflowForDeploy(built);
    if (!validation.valid) {
      console.error(`✗ ${file}: Struktur-Validierung fehlgeschlagen:`, validation.errors);
      process.exitCode = 1;
      continue;
    }
    if (validation.warnings.length) {
      console.warn(`  ${file}: Warnungen —`, validation.warnings.map(w => w.message));
    }

    const mappings: StepMappingT[] = built.steps.map(s => ({
      step_id: s.id,
      n8n_type: s.n8nType,
      type_version: s.n8nTypeVersion,
      parameters: s.parameters,
      credential_type: s.credentialType,
      // Zentrale Credentials automatisch anhängen (Resend SMTP/Twilio/Workspace-Token);
      // Nutzer-Credentials (Gmail/Sheets OAuth) bleiben hier leer — REF-Workflows sind
      // Struktur-Beweise, keine produktiv lauffähigen User-Instanzen.
      credential_id: s.credentialType ? credMap[s.credentialType] : undefined,
    }));
    const n8nJson = buildN8nWorkflow(built, mappings, `${REF_PREFIX}${draft.title}`) as { name: string } & Record<string, unknown>;
    // buildN8nWorkflow präfixt automatisch mit "AXANTILO: " (withAxantiloPrefix) — für die
    // REF-Kennzeichnung überschreiben wir den Namen explizit.
    n8nJson.name = `${REF_PREFIX}${draft.title}`;

    if (!DEPLOY) {
      console.log(`\n[Trockenlauf] ${file} → ${n8nJson.name} (${(n8nJson.nodes as unknown[]).length} Nodes, kein n8n-Call)`);
      continue;
    }
    if (process.env.MOCK_N8N === 'true') {
      console.log(`\n[MOCK_N8N=true] ${file} → ${n8nJson.name} — Deploy übersprungen (Mock-Modus)`);
      continue;
    }
    if (!BASE || !KEY) {
      throw new Error('N8N_API_URL/N8N_API_KEY fehlen — kein Deploy möglich (siehe .env.local).');
    }

    const id = await upsertByName(n8nJson);
    console.log(`✓ ${file} → ${n8nJson.name} (n8n id: ${id})`);
  }
}

main().catch(e => {
  console.error('FAILED:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
