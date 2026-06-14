/**
 * Datenfluss zwischen Schritten — Input/Output je Node + Feld-Extraktion für den
 * Expression-Picker (n8n-Stil: `{{ $json.feld }}` aus dem Output des Vorgängers).
 */

import type { WorkflowStep, WorkflowEdge } from '@/lib/types';
import { n8nNodeNameForStep } from '@/lib/workflow-generator';

/** Pro-Node Lauf-Daten (Teilmenge von N8nNodeRun — client-safe). */
export type NodeRunLite = { node: string; json: unknown[]; status?: 'success' | 'error'; itemCount?: number; error?: string };

export type IoField = { path: string; expression: string; sample: string };

/** Flache, gepunktete Feldliste aus einem Output-Item (für den Field-Picker). */
export function extractFields(obj: unknown, prefix = ''): IoField[] {
  const out: IoField[] = [];
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nested = extractFields(value, path);
        if (nested.length) out.push(...nested);
        else out.push({ path, expression: `{{ $json.${path} }}`, sample: '{}' });
      } else {
        const sample = Array.isArray(value)
          ? `[${value.length}]`
          : value === null || value === undefined
            ? '–'
            : String(value).slice(0, 48);
        out.push({ path, expression: `{{ $json.${path} }}`, sample });
      }
    }
  }
  return out;
}

/** Main-Vorgänger (eingehende Main-Kante) eines Steps. */
export function upstreamStepId(stepId: string, edges: WorkflowEdge[]): string | undefined {
  return edges.find(e => e.target === stepId && !e.connectionType)?.source;
}

/** n8n-Node-Name eines Steps (muss zu buildN8nWorkflow passen, damit runData matcht). */
export function n8nNameForStepIn(step: WorkflowStep, steps: WorkflowStep[]): string {
  return n8nNodeNameForStep(step.label, steps.indexOf(step));
}

/** runData-Eintrag eines Steps (Output dieses Nodes aus dem letzten Testlauf). */
export function runForStep(
  step: WorkflowStep,
  steps: WorkflowStep[],
  runData: NodeRunLite[],
): NodeRunLite | undefined {
  const name = n8nNameForStepIn(step, steps);
  return runData.find(r => r.node === name);
}

/**
 * Verdichtet den letzten Testlauf je Schritt für die Coach-Analyse: Status, Anzahl Datensätze,
 * Output-Felder mit Sample-Werten, Fehler und LEER-Markierung — damit der Editor-Coach beurteilen
 * kann, ob die Daten korrekt durch den Workflow fließen (statt nur roher JSON-Dump).
 */
export function summarizeRunForCoach(
  steps: WorkflowStep[],
  runData: NodeRunLite[],
): string {
  if (!runData?.length) return '';
  const lines: string[] = [];
  for (const step of steps) {
    if (step.subNodeOf) continue; // Sub-Nodes (Modell/Memory/Tool) liefern keinen Flow-Output
    const run = runForStep(step, steps, runData);
    if (!run) continue;
    const status = run.status === 'error' ? 'FEHLER' : 'ok';
    const count = run.itemCount ?? run.json?.length ?? 0;
    const head = `• ${step.label} [${status}, ${count} Datensatz${count === 1 ? '' : 'e'}]`;
    if (run.error) {
      lines.push(`${head}\n   Fehler: ${run.error}`);
      continue;
    }
    if (!count || !run.json?.[0]) {
      lines.push(`${head}\n   Output: LEER — hier kommen keine Daten an/raus.`);
      continue;
    }
    const fields = extractFields(run.json[0]).slice(0, 8);
    const fieldStr = fields.length
      ? fields.map(f => `${f.path}=${f.sample}`).join(', ')
      : '(keine Felder erkannt)';
    lines.push(`${head}\n   Output-Felder: ${fieldStr}`);
  }
  return lines.join('\n');
}

/**
 * Eingangsdaten-Felder eines Steps = Output des Main-Vorgängers aus dem letzten Testlauf.
 * Liefert leere Liste, wenn noch kein Testlauf lief oder kein Vorgänger existiert.
 */
export function inputFieldsForStep(
  step: WorkflowStep,
  steps: WorkflowStep[],
  edges: WorkflowEdge[],
  runData: NodeRunLite[],
): IoField[] {
  const upId = upstreamStepId(step.id, edges);
  if (!upId) return [];
  const up = steps.find(s => s.id === upId);
  if (!up) return [];
  const run = runForStep(up, steps, runData);
  const first = run?.json?.[0];
  return first ? extractFields(first) : [];
}
