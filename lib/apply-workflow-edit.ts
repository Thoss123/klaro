/**
 * Deterministischer Workflow-Edit (Phase 4) — OHNE zweiten LLM.
 *
 * Der Haupt-Coach liefert die überarbeitete Schrittliste selbst (via edit_workflow-Tool,
 * mit vollem Gesprächskontext). Hier wird sie nur noch mechanisch angewandt:
 *  - geänderte/neue Schritte auf echte n8n-Nodes auflösen (heuristicResolveStep)
 *  - unveränderte Schritte (per id) behalten ihre Konfiguration/Position/Sub-Nodes (mergeStepsFromEdit)
 *  - Muster expandieren (Human-in-the-Loop → sendAndWait→IF→Loopback), Trigger zuerst,
 *    Pflicht-Sub-Nodes (Chat Model) anhängen, geteilte Modelle splitten, Defaults anreichern, Layout.
 */

import type { StepConfig, Workflow, WorkflowEdge, WorkflowStep } from '@/lib/types';
import { getCatalogIndex, getN8nCatalog, getNodeByName } from '@/lib/n8n-catalog';
import { heuristicResolveStep } from '@/lib/agents/node-resolver';
import { buildInitialParameters } from '@/lib/n8n-parameter-utils';
import { ensureRequiredSubNodes, splitSharedAiSubNodes } from '@/lib/ai-subnodes';
import { expandPatterns, planEdgesToWorkflowEdges } from '@/lib/workflow-expand';
import { enrichStepsWithSetup } from '@/lib/workflow-setup-coach';
import {
  defaultLinearEdges,
  hasSameStepIds,
  layoutStepPositions,
  mergeEdgesFromEdit,
  mergeStepsFromEdit,
  resolveWorkflowEdges,
  withTriggerFirst,
} from '@/lib/workflow-graph';

/** Vom Coach gelieferter Schritt (wie build_workflow Modus B; id optional, um Config zu erhalten). */
export interface ProvidedEditStep {
  id?: string;
  label: string;
  type?: WorkflowStep['type'];
  tool?: string;
}

export interface WorkflowEditOutput {
  steps: WorkflowStep[];
  edges: WorkflowEdge[];
  message: string;
  changed: boolean;
}

/** True, wenn sich Schritt-IDs oder Edges geändert haben. */
export function workflowStructureChanged(
  before: Workflow,
  after: { steps: WorkflowStep[]; edges: WorkflowEdge[] },
): boolean {
  const idsBefore = before.steps.map(s => s.id).join('\0');
  const idsAfter = after.steps.map(s => s.id).join('\0');
  if (idsBefore !== idsAfter) return true;
  const edgeKey = (e: WorkflowEdge) => `${e.source}>${e.target}:${e.branch ?? 'default'}:${e.connectionType ?? ''}`;
  const before2 = (before.edges ?? []).map(edgeKey).sort().join('\0');
  const after2 = (after.edges ?? []).map(edgeKey).sort().join('\0');
  return before2 !== after2;
}

/**
 * Wendet die vom Coach gelieferten Schritte (+ optionale Edges) auf einen gebauten Workflow an.
 * Unveränderte Schritte werden per id gematcht und behalten ihre Konfiguration.
 */
export async function applyWorkflowEdit(
  workflow: Workflow,
  providedSteps: ProvidedEditStep[],
  providedEdges?: unknown,
  stepConfigs?: Record<string, StepConfig>,
): Promise<WorkflowEditOutput> {
  const index = await getCatalogIndex();
  const catalog = await getN8nCatalog();

  const clean = providedSteps.filter(s => s && typeof s.label === 'string' && s.label.trim());
  if (!clean.length) {
    return {
      steps: workflow.steps,
      edges: resolveWorkflowEdges(workflow.steps, workflow.edges),
      message: 'Keine Schritte übergeben — Workflow unverändert.',
      changed: false,
    };
  }

  // 1. Jeden gelieferten Schritt auf einen echten n8n-Node auflösen.
  const mapped: WorkflowStep[] = clean.map((s, i) => {
    const matchById = s.id && workflow.steps.find(p => p.id === s.id);
    const id = matchById ? matchById.id : (s.id || `step_${i + 1}`);
    const prev = workflow.steps.find(p => p.id === id);
    const toolChanged = !!s.tool && !!prev && s.tool !== prev.tool;

    let resolved: WorkflowStep = {
      ...prev,
      id,
      label: s.label.trim(),
      type: s.type ?? prev?.type ?? (i === 0 ? 'trigger' : 'action'),
      tool: s.tool ?? prev?.tool,
      position: prev?.position,
      note: prev?.note ?? s.label.trim(),
    };

    // Neu oder Tool gewechselt → Node neu auflösen (sonst bestehenden n8nType + Config behalten).
    if (!resolved.n8nType || toolChanged) {
      const h = heuristicResolveStep({ ...resolved, n8nType: undefined }, index);
      if (h) {
        resolved = {
          ...resolved,
          n8nType: h.n8n_type,
          n8nTypeVersion: h.type_version,
          credentialType: h.credential_type,
          tool: h.n8n_type.split('.').pop() ?? resolved.tool,
          parameters: undefined,
        };
      }
    }

    if (resolved.n8nType && (!resolved.parameters || !Object.keys(resolved.parameters).length)) {
      const nodeDef = getNodeByName(catalog, resolved.n8nType);
      if (nodeDef) resolved = { ...resolved, parameters: buildInitialParameters(nodeDef.properties || []) };
    }
    return resolved;
  });

  // 2. Mit bestehenden Schritten mergen — unveränderte behalten Config/Position/Sub-Nodes.
  const mergedSteps = mergeStepsFromEdit(workflow.steps, mapped);

  // 3. Edges: Coach-Edges (falls geliefert), sonst bestehende + linearer Fallback.
  const prevEdges = resolveWorkflowEdges(workflow.steps, workflow.edges);
  const coachEdges = planEdgesToWorkflowEdges(providedEdges, mergedSteps);
  const topologyUnchanged = hasSameStepIds(workflow.steps, mergedSteps);
  const baseEdges = coachEdges
    ?? mergeEdgesFromEdit(prevEdges, topologyUnchanged ? undefined : defaultLinearEdges(mergedSteps), mergedSteps);

  // 4. Muster expandieren → Trigger zuerst → Pflicht-Sub-Nodes → kein geteiltes Modell.
  const expanded = expandPatterns(mergedSteps, baseEdges);
  const wired = withTriggerFirst(expanded.steps, expanded.edges);
  const required = ensureRequiredSubNodes(wired.steps, wired.edges, index);
  const unshared = splitSharedAiSubNodes(required.steps, required.edges);

  // 5. Parameter-Defaults/Setup je Node anreichern + Layout.
  const { steps: setupSteps } = await enrichStepsWithSetup(workflow, unshared.steps, stepConfigs ?? {});
  const positioned = layoutStepPositions(setupSteps, unshared.edges, { force: true });

  const result: WorkflowEditOutput = {
    steps: positioned,
    edges: unshared.edges,
    message: 'Workflow aktualisiert.',
    changed: true,
  };
  result.changed = workflowStructureChanged(workflow, result)
    || JSON.stringify(workflow.steps.map(s => s.n8nType)) !== JSON.stringify(positioned.map(s => s.n8nType));
  return result;
}
