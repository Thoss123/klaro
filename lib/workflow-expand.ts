/**
 * Deterministische Muster-Expansion für gebaute Workflows.
 *
 * Backbone für korrekte Struktur (unabhängig davon, was das LLM liefert):
 *  - Human-in-the-Loop: ein `human`-Schritt wird zu  sendAndWait → IF → (true) weiter /
 *    (false) Rückschleife zum Erzeuger-Schritt.
 *  - Set-Bereinigung: „Durchreich"-Set-Nodes (ein Eingang, ein Ausgang, keine echten
 *    Zuweisungen) werden entfernt und die Kante durchverbunden.
 *
 * Arbeitet NUR auf Main-Edges (ohne connectionType). Muss VOR ensureRequiredSubNodes
 * laufen, solange noch keine AI-Sub-Node-Kanten existieren.
 */

import type { WorkflowEdge, WorkflowStep } from './types';

/**
 * Wandelt vom Coach gelieferte Plan-Edges in echte WorkflowEdges um.
 * Coach-Format pro Edge: { from, to } als 1-basierte Schritt-Nummern (oder
 * source/target als Schritt-IDs), optional branch ("true"|"false"|"switch-N"|"default")
 * und targetInput. Ungültige Edges werden verworfen. Gibt null zurück, wenn keine gültige.
 */
export function planEdgesToWorkflowEdges(
  rawEdges: unknown,
  steps: ReadonlyArray<{ id: string }>,
): WorkflowEdge[] | null {
  if (!Array.isArray(rawEdges) || rawEdges.length === 0) return null;
  const byIndex = (n: unknown) =>
    typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= steps.length ? steps[n - 1].id : undefined;
  const byId = (v: unknown) => (typeof v === 'string' && steps.some(s => s.id === v) ? v : undefined);

  const out: WorkflowEdge[] = [];
  for (const raw of rawEdges as Array<Record<string, unknown>>) {
    if (!raw || typeof raw !== 'object') continue;
    const source = byId(raw.source) ?? byIndex(raw.from);
    const target = byId(raw.target) ?? byIndex(raw.to);
    if (!source || !target) continue;
    out.push({
      id: `e-${source}-${target}-${out.length}`,
      source,
      target,
      branch: typeof raw.branch === 'string' ? (raw.branch as WorkflowEdge['branch']) : 'default',
      ...(typeof raw.targetInput === 'number' ? { targetInput: raw.targetInput } : {}),
    });
  }
  return out.length ? out : null;
}

const IF_NODE = 'n8n-nodes-base.if';
const SET_NODE = 'n8n-nodes-base.set';

function randId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Gültige IF-Bedingung „Freigabe = true" (kompatibel mit ensureNodeParams). */
function approvalIfParameters(): Record<string, unknown> {
  return {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [
        {
          id: randId('cond'),
          leftValue: '={{ $json.data?.approved ?? $json.approved }}',
          rightValue: '',
          operator: { type: 'boolean', operation: 'true', singleValue: true },
        },
      ],
      combinator: 'and',
    },
  };
}

function isPassThroughSet(
  step: WorkflowStep,
  incoming: WorkflowEdge[],
  outgoing: WorkflowEdge[],
): boolean {
  if (step.n8nType !== SET_NODE) return false;
  if (incoming.length !== 1 || outgoing.length !== 1) return false;
  const assignments = (step.parameters?.assignments as { assignments?: unknown[] } | undefined)?.assignments;
  // Echte Feld-Zuweisungen → behalten. Leeres/fehlendes assignments → Durchreich-Node.
  return !assignments || (Array.isArray(assignments) && assignments.length === 0);
}

/**
 * Expandiert Freigabe-/Human-Schritte und entfernt Durchreich-Sets.
 * Gibt neue steps + edges zurück (idempotent genug für wiederholte Builds).
 */
export function expandPatterns(
  steps: WorkflowStep[],
  edges: WorkflowEdge[],
): { steps: WorkflowStep[]; edges: WorkflowEdge[] } {
  let nextSteps = [...steps];
  let nextEdges = [...edges];

  // ── 1. Human-in-the-Loop ────────────────────────────────────────────────
  const humanSteps = nextSteps.filter(s => s.type === 'human' && !s.subNodeOf);
  for (const human of humanSteps) {
    // Schon expandiert? (IF direkt nach diesem Schritt vorhanden)
    const alreadyHasIf = nextEdges.some(
      e => e.source === human.id && !e.connectionType
        && nextSteps.find(s => s.id === e.target)?.n8nType === IF_NODE,
    );
    if (alreadyHasIf) continue;

    const mainOut = nextEdges.filter(e => e.source === human.id && !e.connectionType);
    const incoming = nextEdges.find(e => e.target === human.id && !e.connectionType);
    const generatorId = incoming?.source; // Erzeuger des Entwurfs → Rückschleifen-Ziel

    // sendAndWait-Operation auf dem Kanal-Node markieren.
    const params = { ...(human.parameters ?? {}) } as Record<string, unknown>;
    params.operation = 'sendAndWait';
    if (human.n8nType === 'n8n-nodes-base.gmail') params.resource = 'message';
    const humanWithOp: WorkflowStep = { ...human, parameters: params };
    nextSteps = nextSteps.map(s => (s.id === human.id ? humanWithOp : s));

    // IF-Node direkt hinter dem Human-Schritt einfügen.
    const ifStep: WorkflowStep = {
      id: randId('if-approve'),
      label: 'Freigegeben?',
      type: 'decision',
      n8nType: IF_NODE,
      n8nTypeVersion: 2.2,
      parameters: approvalIfParameters(),
      note: `Freigabe von „${human.label}" auswerten — Ja: weiter, Nein: zurück zur Überarbeitung.`,
    };
    const humanIdx = nextSteps.findIndex(s => s.id === human.id);
    nextSteps.splice(humanIdx + 1, 0, ifStep);

    // Bisherige Ausgänge des Human-Schritts kommen jetzt aus dem IF (Ja-Zweig).
    nextEdges = nextEdges.map(e =>
      mainOut.includes(e) ? { ...e, source: ifStep.id, branch: 'true' as const } : e,
    );
    // Human → IF.
    nextEdges.push({ id: randId('e'), source: human.id, target: ifStep.id, branch: 'default' });
    // Nein-Zweig: zurück zum Erzeuger (Loopback), falls vorhanden.
    if (generatorId) {
      nextEdges.push({ id: randId('e'), source: ifStep.id, target: generatorId, branch: 'false' });
    }
  }

  // ── 2. Durchreich-Sets entfernen ────────────────────────────────────────
  for (const step of [...nextSteps]) {
    if (step.subNodeOf) continue;
    const incoming = nextEdges.filter(e => e.target === step.id && !e.connectionType);
    const outgoing = nextEdges.filter(e => e.source === step.id && !e.connectionType);
    if (!isPassThroughSet(step, incoming, outgoing)) continue;
    const inEdge = incoming[0];
    const outEdge = outgoing[0];
    // Eingangskante auf das Ziel der Ausgangskante umbiegen, Branch des Eingangs behalten.
    nextEdges = nextEdges
      .filter(e => e !== inEdge && e !== outEdge)
      .concat({ ...inEdge, target: outEdge.target });
    nextSteps = nextSteps.filter(s => s.id !== step.id);
  }

  return { steps: nextSteps, edges: nextEdges };
}
