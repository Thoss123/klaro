/**
 * Strukturierte Workflow-Übersicht für den Editor-Agenten —
 * damit LLM/Heuristik exakt wissen, welche Schritte existieren.
 */

import type { Workflow, WorkflowStep } from './types';
import { resolveWorkflowEdges } from './workflow-graph';
import { getNodeByName, getN8nCatalog } from './n8n-catalog';

export type WorkflowStepOverview = {
  schritt: number;
  id: string;
  label: string;
  note?: string;
  type?: string;
  n8nType?: string;
  n8nDisplayName?: string;
  tool?: string;
  parameters?: Record<string, unknown>;
  istSubNode: boolean;
  parentId?: string;
  parentSlot?: string;
  subNodes?: { id: string; label: string; n8nType?: string; slot: string }[];
  ausgaenge?: { ziel: string; zielLabel: string; branch?: string; connectionType?: string }[];
};

/** Haupt-Schritte (ohne Sub-Nodes) mit Nummerierung ab 1. */
export function mainWorkflowSteps(steps: WorkflowStep[]): WorkflowStep[] {
  return steps.filter(s => !s.subNodeOf);
}

export function stepNumber(steps: WorkflowStep[], stepId: string): number {
  const main = mainWorkflowSteps(steps);
  const idx = main.findIndex(s => s.id === stepId);
  return idx >= 0 ? idx + 1 : -1;
}

export async function buildWorkflowOverview(
  workflow: Workflow,
): Promise<WorkflowStepOverview[]> {
  const catalog = await getN8nCatalog();
  const edges = resolveWorkflowEdges(workflow.steps, workflow.edges);
  const main = mainWorkflowSteps(workflow.steps);
  const byId = new Map(workflow.steps.map(s => [s.id, s]));

  return main.map((step, i) => {
    const nodeDef = step.n8nType ? getNodeByName(catalog, step.n8nType) : undefined;
    const subNodes = workflow.steps
      .filter(s => s.subNodeOf?.parentId === step.id)
      .map(s => ({
        id: s.id,
        label: s.label,
        n8nType: s.n8nType,
        slot: s.subNodeOf!.slot,
      }));

    const ausgaenge = edges
      .filter(e => e.source === step.id)
      .map(e => {
        const target = byId.get(e.target);
        return {
          ziel: e.target,
          zielLabel: target?.label ?? e.target,
          branch: e.branch,
          connectionType: e.connectionType,
        };
      });

    return {
      schritt: i + 1,
      id: step.id,
      label: step.label,
      note: step.note,
      type: step.type,
      n8nType: step.n8nType,
      n8nDisplayName: nodeDef?.displayName,
      tool: step.tool,
      parameters: step.parameters,
      istSubNode: false,
      subNodes: subNodes.length ? subNodes : undefined,
      ausgaenge: ausgaenge.length ? ausgaenge : undefined,
    };
  });
}

/** Alle Schritte inkl. Sub-Nodes (flach) für LLM-Kontext. */
export function flattenStepsForEditor(steps: WorkflowStep[]): object[] {
  return steps.map(s => ({
    id: s.id,
    label: s.label,
    note: s.note,
    type: s.type,
    n8nType: s.n8nType,
    tool: s.tool,
    parameters: s.parameters,
    subNodeOf: s.subNodeOf,
    aiSubNodes: s.aiSubNodes,
  }));
}

/** Sucht Schritt per Nummer, Label, Tool oder n8n-Kurzname. */
export function findStepByReference(
  steps: WorkflowStep[],
  ref: string,
): WorkflowStep | undefined {
  const trimmed = ref.trim();
  const num = trimmed.match(/^(\d+)$/)?.[1] ?? trimmed.match(/schritt\s*(\d+)/i)?.[1];
  if (num) {
    const main = mainWorkflowSteps(steps);
    const idx = parseInt(num, 10) - 1;
    if (idx >= 0 && idx < main.length) return main[idx];
  }

  const lower = trimmed.toLowerCase();
  let best: WorkflowStep | undefined;
  let bestScore = 0;

  for (const s of steps) {
    const hay = [
      s.label,
      s.tool,
      s.n8nType?.split('.').pop(),
      s.note,
    ].filter(Boolean).join(' ').toLowerCase();

    if (hay.includes(lower) || lower.includes(hay.split(' ')[0])) {
      const score = hay.length;
      if (score > bestScore) { best = s; bestScore = score; }
      continue;
    }

    for (const word of lower.split(/[^a-zäöüß0-9]+/).filter(w => w.length >= 4)) {
      if (hay.includes(word) && word.length > bestScore) {
        best = s;
        bestScore = word.length;
      }
    }
  }
  return best;
}

/** Quell-Schritt für Tausch finden — Ziel-Klausel wird ausgeschlossen. */
export function findSourceStepForSwap(
  steps: WorkflowStep[],
  message: string,
  explicitStepNum: number | null,
  targetClause: string,
): WorkflowStep | undefined {
  if (explicitStepNum != null) {
    const main = mainWorkflowSteps(steps);
    const idx = explicitStepNum - 1;
    if (idx >= 0 && idx < main.length) return main[idx];
  }

  const sourceText = message
    .replace(new RegExp(targetClause.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
    .toLowerCase();

  let best: WorkflowStep | undefined;
  let bestLen = 0;

  for (const s of mainWorkflowSteps(steps)) {
    const hay = `${s.label} ${s.tool ?? ''} ${s.n8nType?.split('.').pop() ?? ''}`.toLowerCase();
    for (const word of hay.split(/[^a-zäöüß0-9]+/).filter(w => w.length >= 4)) {
      if (sourceText.includes(word) && word.length > bestLen) {
        best = s;
        bestLen = word.length;
      }
    }
  }
  return best;
}

export function formatOverviewForPrompt(overview: WorkflowStepOverview[]): string {
  return overview.map(s => {
    const parts = [
      `Schritt ${s.schritt} [${s.id}]: „${s.label}"`,
      s.n8nDisplayName ? `→ ${s.n8nDisplayName} (${s.n8nType})` : s.n8nType ? `→ ${s.n8nType}` : '',
      s.note ? `Zweck: ${s.note}` : '',
      s.parameters && Object.keys(s.parameters).length
        ? `Parameter: ${JSON.stringify(s.parameters)}`
        : '',
      s.subNodes?.length
        ? `Sub-Nodes: ${s.subNodes.map(n => `${n.label} (${n.slot})`).join(', ')}`
        : '',
      s.ausgaenge?.length
        ? `Ausgänge: ${s.ausgaenge.map(a => a.connectionType ? `${a.zielLabel} [${a.connectionType}]` : a.zielLabel).join(' → ')}`
        : '',
    ].filter(Boolean);
    return parts.join('\n  ');
  }).join('\n\n');
}
