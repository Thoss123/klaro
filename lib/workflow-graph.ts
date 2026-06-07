/**
 * Workflow graph — IF/Switch/Merge branches, DAG layout, n8n connection mapping.
 */

import type { WorkflowEdge, WorkflowStep } from './types';

export const IF_NODE = 'n8n-nodes-base.if';
export const SWITCH_NODE = 'n8n-nodes-base.switch';
export const MERGE_NODE = 'n8n-nodes-base.merge';

const BRANCH_NODE_TYPES = new Set([IF_NODE, SWITCH_NODE]);

export function isIfStep(step: WorkflowStep): boolean {
  return step.n8nType === IF_NODE || (step.type === 'decision' && !step.n8nType);
}

export function isSwitchStep(step: WorkflowStep): boolean {
  return step.n8nType === SWITCH_NODE;
}

export function isMergeStep(step: WorkflowStep): boolean {
  return step.n8nType === MERGE_NODE;
}

/** @deprecated use isIfStep || isSwitchStep */
export function isBranchStep(step: WorkflowStep): boolean {
  return step.type === 'decision'
    || (step.n8nType != null && BRANCH_NODE_TYPES.has(step.n8nType));
}

/** Switch output count (rules + fallback). Default 4 outputs in UI. */
export function getSwitchOutputCount(step: WorkflowStep): number {
  const rules = step.parameters?.rules;
  if (rules && typeof rules === 'object' && Array.isArray((rules as { values?: unknown[] }).values)) {
    const n = (rules as { values: unknown[] }).values.length;
    return Math.max(2, Math.min(n + 1, 8));
  }
  const n = Number(step.parameters?.outputCount);
  if (Number.isFinite(n) && n >= 2) return Math.min(n, 8);
  return 4;
}

/** Merge input slots shown on canvas. */
export function getMergeInputCount(step: WorkflowStep): number {
  const n = Number(step.parameters?.numberInputs);
  if (Number.isFinite(n) && n >= 2) return Math.min(n, 6);
  return 3;
}

export function switchBranch(index: number): string {
  return `switch-${index}`;
}

export function parseSwitchBranch(branch: string | undefined): number | null {
  if (!branch?.startsWith('switch-')) return null;
  const n = parseInt(branch.slice(7), 10);
  return Number.isFinite(n) ? n : null;
}

export function defaultLinearEdges(steps: WorkflowStep[]): WorkflowEdge[] {
  const edges: WorkflowEdge[] = [];
  for (let i = 1; i < steps.length; i++) {
    edges.push({
      id: `e-${steps[i - 1].id}-${steps[i].id}`,
      source: steps[i - 1].id,
      target: steps[i].id,
      branch: 'default',
    });
  }
  return edges;
}

export function resolveWorkflowEdges(
  steps: WorkflowStep[],
  edges?: WorkflowEdge[],
): WorkflowEdge[] {
  if (edges?.length) return edges;
  return defaultLinearEdges(steps);
}

/** Map edge branch → React Flow source handle id. */
export function branchToSourceHandle(
  branch: WorkflowEdge['branch'],
  sourceStep?: WorkflowStep,
): string | undefined {
  if (!branch || branch === 'default') return undefined;
  if (branch === 'true') return 'true';
  if (branch === 'false') return 'false';
  const sw = parseSwitchBranch(branch);
  if (sw != null) return `switch-${sw}`;
  return undefined;
}

/** AI-Sub-Connection (Sub-Node oben → Parent-Slot unten). */
export function aiConnectionFromHandles(
  sourceHandle: string | null | undefined,
  targetHandle: string | null | undefined,
): string | undefined {
  if (sourceHandle === 'ai_out' && targetHandle) return targetHandle;
  return undefined;
}

/** Map React Flow connection → workflow edge branch + target input. */
export function connectionToEdgeFields(
  sourceHandle: string | null | undefined,
  targetHandle: string | null | undefined,
  sourceStep?: WorkflowStep,
): { branch: WorkflowEdge['branch']; targetInput?: number } {
  let branch: WorkflowEdge['branch'] = 'default';
  if (sourceHandle === 'true') branch = 'true';
  else if (sourceHandle === 'false') branch = 'false';
  else if (sourceHandle?.startsWith('switch-')) branch = sourceHandle;

  if (sourceStep && isIfStep(sourceStep) && branch === 'default') {
    branch = 'true';
  }
  if (sourceStep && isSwitchStep(sourceStep) && branch === 'default') {
    branch = switchBranch(0);
  }

  let targetInput: number | undefined;
  if (targetHandle?.startsWith('input-')) {
    targetInput = parseInt(targetHandle.slice(6), 10);
  }

  return { branch, targetInput: Number.isFinite(targetInput!) ? targetInput : undefined };
}

/** n8n source output index (IF: 0=true, 1=false; Switch: rule index). */
export function branchOutputIndex(
  branch: WorkflowEdge['branch'] | undefined,
  sourceStep?: WorkflowStep,
): number {
  if (!branch || branch === 'default') return 0;
  if (branch === 'true') return 0;
  if (branch === 'false') return 1;
  const sw = parseSwitchBranch(branch);
  if (sw != null) return sw;
  return 0;
}

/** n8n target input index (Merge and similar). */
export function edgeTargetInput(edge: WorkflowEdge): number {
  return edge.targetInput ?? 0;
}

const NODE_W = 260;
const NODE_H = 130;
const LAYER_GAP = 300;
/** Vertical gap between node rows (icon + label below). */
const ROW_GAP = 190;

/** Layered DAG layout — spreads branches vertically per column. */
export function layoutStepPositions(
  steps: WorkflowStep[],
  edges: WorkflowEdge[],
  options?: { force?: boolean },
): WorkflowStep[] {
  if (!options?.force && steps.length > 0 && steps.every(s => s.position)) {
    return steps;
  }
  if (!steps.length) return steps;

  const byId = new Map(steps.map(s => [s.id, { ...s }]));
  // AI-Sub-Nodes & AI-Edges aus dem Haupt-Layout heraushalten.
  const mainSteps = steps.filter(s => !s.subNodeOf);
  const mainEdges = edges.filter(e => !e.connectionType);

  const inDegree = new Map<string, number>();
  for (const s of mainSteps) inDegree.set(s.id, 0);
  for (const e of mainEdges) {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  const layers = new Map<string, number>();
  const roots = mainSteps.filter(s => (inDegree.get(s.id) ?? 0) === 0);
  const queue = [...(roots.length ? roots : mainSteps.slice(0, 1)).map(s => s.id)];
  for (const id of queue) layers.set(id, 0);

  let qi = 0;
  while (qi < queue.length) {
    const id = queue[qi++];
    const layer = layers.get(id) ?? 0;
    for (const e of mainEdges.filter(x => x.source === id)) {
      const next = layer + 1;
      if (!layers.has(e.target) || (layers.get(e.target) ?? 0) < next) {
        layers.set(e.target, next);
        queue.push(e.target);
      }
    }
  }

  for (const s of mainSteps) {
    if (!layers.has(s.id)) layers.set(s.id, 0);
  }

  const layerBuckets = new Map<number, string[]>();
  for (const [id, layer] of layers) {
    if (!layerBuckets.has(layer)) layerBuckets.set(layer, []);
    layerBuckets.get(layer)!.push(id);
  }

  const stepOrder = new Map(steps.map((s, i) => [s.id, i]));
  for (const [layer, ids] of layerBuckets) {
    const sorted = [...ids].sort((a, b) => (stepOrder.get(a) ?? 0) - (stepOrder.get(b) ?? 0));
    const totalH = (sorted.length - 1) * ROW_GAP;
    const startY = 200 - totalH / 2;
    sorted.forEach((id, i) => {
      const step = byId.get(id);
      if (!step) return;
      step.position = {
        x: 80 + layer * LAYER_GAP,
        y: startY + i * ROW_GAP,
      };
    });
  }

  // Sub-Nodes unter ihren Parent setzen (nebeneinander pro Slot-Reihenfolge).
  const subByParent = new Map<string, string[]>();
  for (const s of steps) {
    if (!s.subNodeOf) continue;
    const arr = subByParent.get(s.subNodeOf.parentId) ?? [];
    arr.push(s.id);
    subByParent.set(s.subNodeOf.parentId, arr);
  }
  for (const [parentId, subIds] of subByParent) {
    const parent = byId.get(parentId);
    if (!parent?.position) continue;
    subIds.forEach((id, i) => {
      const sub = byId.get(id);
      if (!sub) return;
      sub.position = {
        x: parent.position!.x - 90 + i * 130,
        y: parent.position!.y + 210,
      };
    });
  }

  return steps.map(s => byId.get(s.id) ?? s);
}

/** Remove step and dangling edges; re-index linear fallback if graph breaks. */
export function removeStepFromGraph(
  steps: WorkflowStep[],
  edges: WorkflowEdge[],
  stepId: string,
): { steps: WorkflowStep[]; edges: WorkflowEdge[] } {
  const removeIds = new Set<string>([stepId]);
  for (const s of steps) {
    if (s.subNodeOf?.parentId === stepId) removeIds.add(s.id);
  }

  let nextSteps = steps
    .filter(s => !removeIds.has(s.id))
    .map(s => {
      if (!s.aiSubNodes) return s;
      const aiSubNodes: Record<string, string[]> = {};
      for (const [slot, ids] of Object.entries(s.aiSubNodes)) {
        const kept = ids.filter(id => !removeIds.has(id));
        if (kept.length) aiSubNodes[slot] = kept;
      }
      return Object.keys(aiSubNodes).length ? { ...s, aiSubNodes } : { ...s, aiSubNodes: undefined };
    });

  let nextEdges = edges.filter(e => !removeIds.has(e.source) && !removeIds.has(e.target));
  const mainSteps = nextSteps.filter(s => !s.subNodeOf);
  const mainEdges = nextEdges.filter(e => !e.connectionType);
  if (!mainEdges.length && mainSteps.length > 1) {
    nextEdges = [
      ...nextEdges.filter(e => e.connectionType),
      ...defaultLinearEdges(mainSteps),
    ];
  }
  return { steps: nextSteps, edges: nextEdges };
}

/** Insert a step; optionally wire from `afterStepId` on given branch. */
export function insertStepInGraph(
  steps: WorkflowStep[],
  edges: WorkflowEdge[],
  newStep: WorkflowStep,
  options?: { afterStepId?: string; branch?: WorkflowEdge['branch']; targetInput?: number },
): { steps: WorkflowStep[]; edges: WorkflowEdge[] } {
  const nextSteps = [...steps];
  const afterId = options?.afterStepId;
  const insertIdx = afterId
    ? Math.max(0, steps.findIndex(s => s.id === afterId) + 1)
    : nextSteps.length;
  nextSteps.splice(insertIdx, 0, newStep);

  let nextEdges = [...edges];
  if (afterId) {
    const outEdge = edges.find(e => e.source === afterId);
    const downstream = outEdge?.target;
    nextEdges = nextEdges.filter(e => e.source !== afterId || e.id !== outEdge?.id);
    nextEdges.push({
      id: `e-${afterId}-${newStep.id}`,
      source: afterId,
      target: newStep.id,
      branch: options?.branch ?? outEdge?.branch ?? 'default',
    });
    if (downstream) {
      nextEdges.push({
        id: `e-${newStep.id}-${downstream}`,
        source: newStep.id,
        target: downstream,
        branch: 'default',
        targetInput: options?.targetInput,
      });
    }
  } else if (!nextEdges.length && nextSteps.length > 1) {
    nextEdges = defaultLinearEdges(nextSteps);
  }

  return { steps: nextSteps, edges: nextEdges };
}

export function createIfStep(): WorkflowStep {
  return {
    id: `if-${Date.now()}`,
    label: 'Bedingung (IF)',
    type: 'decision',
    n8nType: IF_NODE,
    n8nTypeVersion: 2,
    tool: 'if',
    parameters: {
      conditions: {
        options: { version: 2, leftValue: '', caseSensitive: true, typeValidation: 'strict' },
        combinator: 'and',
        conditions: [{
          id: `cond-${Date.now()}`,
          leftValue: '={{ $json.status }}',
          rightValue: '',
          operator: { type: 'string', operation: 'isNotEmpty' },
        }],
      },
    },
  };
}

export function createSwitchStep(): WorkflowStep {
  return {
    id: `switch-${Date.now()}`,
    label: 'Switch',
    type: 'decision',
    n8nType: SWITCH_NODE,
    n8nTypeVersion: 3,
    tool: 'switch',
    parameters: {
      rules: {
        values: [
          { conditions: { conditions: [{ leftValue: '={{ $json.route }}', rightValue: 'a', operator: { type: 'string', operation: 'equals' } }] } },
          { conditions: { conditions: [{ leftValue: '={{ $json.route }}', rightValue: 'b', operator: { type: 'string', operation: 'equals' } }] } },
        ],
      },
      outputCount: 3,
    },
  };
}

export function createMergeStep(): WorkflowStep {
  return {
    id: `merge-${Date.now()}`,
    label: 'Merge',
    type: 'output',
    n8nType: MERGE_NODE,
    n8nTypeVersion: 3,
    tool: 'merge',
    parameters: {
      mode: 'append',
      numberInputs: 3,
    },
  };
}

/** Stable id for an auto-inserted trigger — avoids duplicate/floating triggers across edits. */
const AUTO_TRIGGER_ID = 'trigger-auto';

function makeAutoTrigger(): WorkflowStep {
  return {
    id: AUTO_TRIGGER_ID,
    label: 'Start',
    type: 'trigger',
    n8nType: 'n8n-nodes-base.manualTrigger',
    n8nTypeVersion: 1,
    tool: 'manualTrigger',
  };
}

/** First step must be a trigger — fix if needed (steps only; prefer withTriggerFirst). */
export function ensureTriggerFirst(steps: WorkflowStep[]): WorkflowStep[] {
  if (!steps.length) return steps;
  if (steps[0].type === 'trigger') return steps;
  // Wenn schon ein Auto-Trigger irgendwo existiert, nicht erneut anlegen.
  if (steps.some(s => s.id === AUTO_TRIGGER_ID)) {
    const trigger = steps.find(s => s.id === AUTO_TRIGGER_ID)!;
    return [trigger, ...steps.filter(s => s.id !== AUTO_TRIGGER_ID)];
  }
  return [makeAutoTrigger(), ...steps];
}

/**
 * Garantiert: erster Schritt ist ein Trigger UND er ist mit dem Rest verbunden.
 * Verhindert den "Trigger löst sich vom Flow ab"-Bug — Kante wird mitgepflegt.
 */
export function withTriggerFirst(
  steps: WorkflowStep[],
  edges: WorkflowEdge[],
): { steps: WorkflowStep[]; edges: WorkflowEdge[] } {
  if (!steps.length) return { steps, edges };
  if (steps[0].type === 'trigger') {
    // Trigger vorhanden — sicherstellen, dass er eine ausgehende Kante hat.
    const trigger = steps[0];
    const hasOut = edges.some(e => e.source === trigger.id);
    if (hasOut || steps.length < 2) return { steps, edges };
    return {
      steps,
      edges: [
        { id: `e-${trigger.id}-${steps[1].id}`, source: trigger.id, target: steps[1].id, branch: 'default' },
        ...edges,
      ],
    };
  }

  const nextSteps = ensureTriggerFirst(steps);
  const trigger = nextSteps[0];
  const firstReal = nextSteps[1];
  if (!firstReal) return { steps: nextSteps, edges };
  // Falls noch keine Kante vom Trigger existiert → wire ihn an den ersten echten Schritt.
  const alreadyWired = edges.some(e => e.source === trigger.id);
  const nextEdges = alreadyWired
    ? edges
    : [
        { id: `e-${trigger.id}-${firstReal.id}`, source: trigger.id, target: firstReal.id, branch: 'default' as const },
        ...edges,
      ];
  return { steps: nextSteps, edges: nextEdges };
}

/** Stabiler Edge-Schlüssel für Merge (Main + AI-Sub-Connections). */
export function edgeKey(e: WorkflowEdge): string {
  if (e.connectionType) return `ai:${e.source}:${e.target}:${e.connectionType}`;
  return `main:${e.source}:${e.target}:${e.branch ?? 'default'}:${e.targetInput ?? 0}`;
}

export function filterEdgesForSteps(edges: WorkflowEdge[], steps: WorkflowStep[]): WorkflowEdge[] {
  const ids = new Set(steps.map(s => s.id));
  return edges.filter(e => ids.has(e.source) && ids.has(e.target));
}

/** Gleiche Schritt-IDs = Topologie unverändert (nur Node-Typ/Parameter getauscht). */
export function hasSameStepIds(prev: WorkflowStep[], next: WorkflowStep[]): boolean {
  if (prev.length !== next.length) return false;
  const ids = new Set(prev.map(s => s.id));
  for (const s of next) if (!ids.has(s.id)) return false;
  return true;
}

/**
 * Schritte aus AI-Edit mit Vorherigem zusammenführen — Sub-Nodes, Positionen, Metadaten behalten.
 */
export function mergeStepsFromEdit(prev: WorkflowStep[], next: WorkflowStep[]): WorkflowStep[] {
  const nextIds = new Set(next.map(s => s.id));
  const byPrev = new Map(prev.map(s => [s.id, s]));

  const merged: WorkflowStep[] = next.map(s => {
    const p = byPrev.get(s.id);
    if (!p) return s;
    return {
      ...p,
      ...s,
      position: p.position ?? s.position,
      note: s.note ?? p.note,
      subNodeOf: s.subNodeOf ?? p.subNodeOf,
      aiSubNodes: s.aiSubNodes ?? p.aiSubNodes,
      parameters: { ...p.parameters, ...s.parameters },
    };
  });

  // Sub-Nodes die das LLM weggelassen hat, Parent existiert noch
  for (const p of prev) {
    if (p.subNodeOf && nextIds.has(p.subNodeOf.parentId) && !nextIds.has(p.id)) {
      merged.push(p);
    }
  }

  return merged;
}

/**
 * Verbindungen nach AI-Edit — bestehende Edges behalten, Vorschläge nur ergänzen/überschreiben.
 * Niemals die komplette Edge-Liste durch eine unvollständige LLM-Antwort ersetzen.
 */
export function mergeEdgesFromEdit(
  prevEdges: WorkflowEdge[],
  proposedEdges: WorkflowEdge[] | undefined | null,
  steps: WorkflowStep[],
): WorkflowEdge[] {
  const validPrev = filterEdgesForSteps(prevEdges, steps);
  const merged = new Map<string, WorkflowEdge>();
  for (const e of validPrev) merged.set(edgeKey(e), e);

  if (proposedEdges?.length) {
    const ids = new Set(steps.map(s => s.id));
    for (const e of proposedEdges) {
      if (ids.has(e.source) && ids.has(e.target)) {
        merged.set(edgeKey(e), e);
      }
    }
  }

  let result = Array.from(merged.values());

  // Fallback: keine Main-Verbindung mehr → lineare Hauptkette wiederherstellen
  const mainSteps = steps.filter(s => !s.subNodeOf);
  const mainIds = new Set(mainSteps.map(s => s.id));
  const hasMain = result.some(
    e => !e.connectionType && mainIds.has(e.source) && mainIds.has(e.target),
  );
  if (!hasMain && mainSteps.length > 1) {
    for (const e of defaultLinearEdges(mainSteps)) {
      if (!merged.has(edgeKey(e))) result.push(e);
    }
  }

  return result;
}
