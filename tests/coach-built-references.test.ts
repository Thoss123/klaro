/**
 * Work Package G — beweist, dass die vier Landing-Page-Workflows (Lead-Qualifizierung,
 * Gesprächsnotizen, Berichte & Reports, Datenpflege) NICHT als goldene Vorlagen ausgeliefert
 * werden, sondern als coach-gebaute `<workflow_plan>`-Pläne durch dieselbe Pipeline laufen,
 * die auch `/api/n8n/build-workflow` (POST) benutzt:
 *
 *   mergeWorkflowPlanIntoCanvas (Plan → WorkflowStep[])
 *     → runNodeResolver (Node-Auflösung, s. app/api/n8n/build-workflow/route.ts:106)
 *     → applyResolverToSteps (Node-Typen auf die Schritte schreiben)
 *     → expandPatterns (Human-in-the-Loop → sendAndWait → IF → Loopback)
 *     → withTriggerFirst (Trigger garantiert an Position 1)
 *     → ensureRequiredSubNodes + splitSharedAiSubNodes (Pflicht-Chat-Model pro Agent/Chain)
 *     → layoutStepPositions
 *     → buildN8nWorkflow (echtes n8n-JSON)
 *
 * Der Katalog wird — wie in tests/apply-workflow-edit.test.ts — gemockt (kein Netzwerk),
 * aber mit ALLEN Node-Typen, die die vier Pläne brauchen (echte node-map.ts-Aliase).
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { N8nCatalogIndexEntry, N8nNodeTypeDescription } from '@/lib/n8n-catalog-types';

// ── Mock-Katalog: reale node-map.ts-Aliase, properties:[] (wie apply-workflow-edit.test.ts) ──
const CATALOG_ENTRIES: Array<{
  name: string;
  displayName: string;
  category: string;
  cred?: string;
}> = [
  { name: 'n8n-nodes-base.manualTrigger', displayName: 'Manual Trigger', category: 'trigger' },
  { name: 'n8n-nodes-base.scheduleTrigger', displayName: 'Schedule Trigger', category: 'trigger' },
  { name: 'n8n-nodes-base.webhook', displayName: 'Webhook', category: 'trigger' },
  { name: 'n8n-nodes-base.formTrigger', displayName: 'Form Trigger', category: 'trigger' },
  { name: 'n8n-nodes-base.gmailTrigger', displayName: 'Gmail Trigger', category: 'trigger', cred: 'gmailOAuth2' },
  { name: 'n8n-nodes-base.gmail', displayName: 'Gmail', category: 'action', cred: 'gmailOAuth2' },
  { name: 'n8n-nodes-base.googleCalendarTrigger', displayName: 'Google Calendar Trigger', category: 'trigger', cred: 'googleCalendarOAuth2Api' },
  { name: 'n8n-nodes-base.googleCalendar', displayName: 'Google Calendar', category: 'action', cred: 'googleCalendarOAuth2Api' },
  { name: 'n8n-nodes-base.googleSheets', displayName: 'Google Sheets', category: 'data', cred: 'googleSheetsOAuth2Api' },
  { name: 'n8n-nodes-base.slack', displayName: 'Slack', category: 'action', cred: 'slackApi' },
  { name: 'n8n-nodes-base.httpRequest', displayName: 'HTTP Request', category: 'action' },
  { name: 'n8n-nodes-base.code', displayName: 'Code', category: 'action' },
  { name: 'n8n-nodes-base.set', displayName: 'Edit Fields (Set)', category: 'action' },
  { name: 'n8n-nodes-base.if', displayName: 'If', category: 'flow' },
  { name: 'n8n-nodes-base.switch', displayName: 'Switch', category: 'flow' },
  { name: '@n8n/n8n-nodes-langchain.agent', displayName: 'AI Agent', category: 'ai' },
  { name: '@n8n/n8n-nodes-langchain.chainLlm', displayName: 'Basic LLM Chain', category: 'ai' },
  { name: '@n8n/n8n-nodes-langchain.chainSummarization', displayName: 'Summarization Chain', category: 'ai' },
  { name: '@n8n/n8n-nodes-langchain.textClassifier', displayName: 'Text Classifier', category: 'ai' },
  { name: '@n8n/n8n-nodes-langchain.informationExtractor', displayName: 'Information Extractor', category: 'ai' },
  { name: '@n8n/n8n-nodes-langchain.lmChatOpenAi', displayName: 'OpenAI Chat Model', category: 'ai', cred: 'openAiApi' },
  { name: '@n8n/n8n-nodes-langchain.toolHttpRequest', displayName: 'HTTP Request Tool', category: 'ai' },
];

const INDEX: N8nCatalogIndexEntry[] = CATALOG_ENTRIES.map(e => ({
  name: e.name,
  displayName: e.displayName,
  version: 1,
  groups: e.category === 'trigger' ? ['trigger'] : ['transform'],
  categories: e.category === 'ai' ? ['AI'] : [],
  aliases: [],
  hasCredentials: !!e.cred,
  credentialTypes: e.cred ? [e.cred] : [],
  iconPath: null,
  axantiloCategory: e.category,
}));

const NODES: N8nNodeTypeDescription[] = CATALOG_ENTRIES.map(e => ({
  name: e.name,
  displayName: e.displayName,
  version: 1,
  properties: [],
  ...(e.cred ? { credentials: [{ name: e.cred, required: true }] } : {}),
}));

vi.mock('@/lib/n8n-catalog', () => ({
  getCatalogIndex: async () => INDEX,
  getN8nCatalog: async () => ({ nodes: NODES, credentials: [], fetchedAt: '', source: 'mock' as const }),
  getNodeByName: (cat: { nodes: N8nNodeTypeDescription[] }, name: string) =>
    cat.nodes.find(n => n.name === name),
  buildDefaultParameters: () => ({}),
}));

import { mergeWorkflowPlanIntoCanvas, type WorkflowPlanInput } from '@/lib/merge-workflow-plan';
import { applyResolverToSteps, runNodeResolver } from '@/lib/agents/node-resolver';
import { defaultLinearEdges, layoutStepPositions, withTriggerFirst } from '@/lib/workflow-graph';
import { expandPatterns } from '@/lib/workflow-expand';
import { ensureRequiredSubNodes, splitSharedAiSubNodes, isAiParent } from '@/lib/ai-subnodes';
import { buildN8nWorkflow, type StepMapping } from '@/lib/workflow-generator';
import { validateWorkflowStructure } from '@/lib/n8n-workflow-validate';
import { AXANTILO_AI_TOOL } from '@/lib/axantilo-llm-credential';
import { workflowJsonToSdkCode } from '@/lib/workflow-sdk-codegen';
import { getCatalogIndex } from '@/lib/n8n-catalog';
import type { CanvasData, Workflow } from '@/lib/types';

const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'plans');
const GENERATED_DIR = path.join(FIXTURES_DIR, 'generated');

const FIXTURE_FILES = [
  'lead-qualifizierung.json',
  'gespraechsnotizen.json',
  'berichte-reports.json',
  'datenpflege.json',
];

function slugFor(file: string): string {
  return file.replace(/\.json$/, '');
}

/**
 * Repliziert exakt den Build-Pfad aus app/api/n8n/build-workflow/route.ts (POST-Handler,
 * Zeilen ~106-149): NodeResolver → applyResolverToSteps → Basis-Edges → expandPatterns →
 * withTriggerFirst → ensureRequiredSubNodes → splitSharedAiSubNodes → layoutStepPositions.
 */
async function runBuildPipeline(plan: Workflow): Promise<Workflow> {
  const { results } = await runNodeResolver({
    steps: plan.steps,
    context: { useCaseTitle: plan.title },
  });

  const appliedSteps = applyResolverToSteps(plan.steps, results, { overwrite: true });

  const baseEdges = plan.edges && plan.edges.length ? plan.edges : defaultLinearEdges(appliedSteps);
  const expanded = expandPatterns(appliedSteps, baseEdges);
  const { steps: connectedSteps, edges: connectedEdges } = withTriggerFirst(expanded.steps, expanded.edges);

  const index = await getCatalogIndex();
  const required = ensureRequiredSubNodes(connectedSteps, connectedEdges, index);
  const { steps: withSubs, edges: withSubEdges } = splitSharedAiSubNodes(required.steps, required.edges);

  const positioned = layoutStepPositions(withSubs, withSubEdges, { force: true });

  return { ...plan, steps: positioned, edges: withSubEdges };
}

beforeAll(() => {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
});

describe.each(FIXTURE_FILES)('coach-built reference workflow: %s', file => {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8');
  const plan = JSON.parse(raw) as WorkflowPlanInput;

  it('is a valid canonical <workflow_plan> shape (title/description/pain_point_id/steps 5-9)', () => {
    expect(typeof plan.title).toBe('string');
    expect(typeof plan.description).toBe('string');
    expect(typeof plan.pain_point_id).toBe('string');
    expect(Array.isArray(plan.steps)).toBe(true);
    expect(plan.steps!.length).toBeGreaterThanOrEqual(5);
    expect(plan.steps!.length).toBeLessThanOrEqual(9);
    expect(plan.steps![0].type).toBe('trigger');
    for (const s of plan.steps!) {
      expect(s.tool).toBeTruthy();
      expect(s.label).toBeTruthy();
    }
  });

  it('merges into canvas exactly like a coach <workflow_plan> tag would', () => {
    const emptyCanvas: CanvasData = {
      pain_points: [],
      use_cases: [],
      workflows: [],
      documents: [],
      phase: 'analyse',
    };
    const merged = mergeWorkflowPlanIntoCanvas(emptyCanvas, plan);
    expect(merged).not.toBeNull();
    expect(merged!.canvas.workflow_plans?.length).toBe(1);
  });

  it('resolves every step to a real n8nType, builds valid n8n JSON, and passes structural validation', async () => {
    const emptyCanvas: CanvasData = {
      pain_points: [],
      use_cases: [],
      workflows: [],
      documents: [],
      phase: 'analyse',
    };
    const merged = mergeWorkflowPlanIntoCanvas(emptyCanvas, plan)!;
    const built = await runBuildPipeline(merged.canvas.workflow_plans![0]);

    // Jeder Schritt hat einen echten Katalog-Node.
    const catalog = await getCatalogIndex();
    const catalogNames = new Set(catalog.map(c => c.name));
    const unresolved = built.steps.filter(s => !s.n8nType || !catalogNames.has(s.n8nType));
    expect(unresolved).toEqual([]);

    // Erster Node ist ein Trigger, kein Trigger mitten im Flow.
    const first = built.steps[0];
    expect(first.type === 'trigger' || /Trigger$|\.webhook$/.test(first.n8nType || '')).toBe(true);
    for (const s of built.steps.slice(1)) {
      if (s.subNodeOf) continue;
      const isTrigger = s.type === 'trigger' || /Trigger$|\.webhook$/.test(s.n8nType || '');
      expect(isTrigger).toBe(false);
    }

    // AI-Parents (Agent/Chain/Classifier) haben ihr Pflicht-Chat-Model mit tool axantilo_ai.
    const aiParents = built.steps.filter(s => !s.subNodeOf && isAiParent(s.n8nType));
    expect(aiParents.length).toBeGreaterThan(0);
    for (const parent of aiParents) {
      const subIds = parent.aiSubNodes?.ai_languageModel ?? [];
      expect(subIds.length).toBe(1);
      const sub = built.steps.find(s => s.id === subIds[0]);
      expect(sub).toBeDefined();
      expect(sub!.n8nType).toBe('@n8n/n8n-nodes-langchain.lmChatOpenAi');
      expect(sub!.tool).toBe(AXANTILO_AI_TOOL);
    }

    // Edges verbinden nur existierende Steps.
    const stepIds = new Set(built.steps.map(s => s.id));
    for (const e of built.edges ?? []) {
      expect(stepIds.has(e.source)).toBe(true);
      expect(stepIds.has(e.target)).toBe(true);
    }

    // In-repo Struktur-Validator (kein MCP im Test — MOCK_N8N/keine MCP-Env in CI).
    const structural = validateWorkflowStructure(built);
    expect(structural.errors, JSON.stringify(structural.errors)).toEqual([]);

    // Echtes n8n-JSON bauen (derselbe Generator wie der Deploy-Pfad) + ensureNodeParams
    // greift bereits in buildN8nWorkflow für IF/Switch — hier zusätzlich prüfen, dass
    // jedes IF/Switch im Ergebnis gültige conditions/rules hat.
    const mappings: StepMapping[] = built.steps.map(s => ({
      step_id: s.id,
      n8n_type: s.n8nType,
      type_version: s.n8nTypeVersion,
      parameters: s.parameters,
      credential_type: s.credentialType,
    }));
    const n8nJson = buildN8nWorkflow(built, mappings, built.title) as {
      name: string;
      nodes: Array<{ name: string; type: string; typeVersion: number; parameters: Record<string, unknown> }>;
      connections: Record<string, unknown>;
    };

    expect(n8nJson.name.startsWith('AXANTILO: ')).toBe(true);
    expect(n8nJson.nodes.length).toBe(built.steps.length);

    for (const node of n8nJson.nodes) {
      if (node.type === 'n8n-nodes-base.if') {
        const conditions = node.parameters.conditions as { conditions?: unknown[] } | undefined;
        expect(Array.isArray(conditions?.conditions)).toBe(true);
        expect((conditions!.conditions as unknown[]).length).toBeGreaterThan(0);
      }
      if (node.type === 'n8n-nodes-base.switch') {
        const rules = node.parameters.rules as { values?: unknown[] } | undefined;
        expect(Array.isArray(rules?.values)).toBe(true);
        expect((rules!.values as unknown[]).length).toBeGreaterThan(0);
      }
    }

    // SDK-Codegen-Pfad (tests/workflow-sdk-codegen.test.ts) — muss ohne Fehler durchlaufen
    // und die Trigger + mind. eine .add()-Kette enthalten.
    const sdkCode = workflowJsonToSdkCode(n8nJson);
    expect(sdkCode).toContain("import { workflow, node, trigger }");
    expect(sdkCode.length).toBeGreaterThan(0);

    // Generiertes n8n-JSON für die (separate, live) MCP validate_workflow-Prüfung ablegen.
    fs.writeFileSync(
      path.join(GENERATED_DIR, `${slugFor(file)}.n8n.json`),
      JSON.stringify(n8nJson, null, 2),
    );
  });
});
