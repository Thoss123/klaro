/**
 * Verdichtet die *eigene* Dokumentation eines n8n-Nodes (aus nodes.json) zu einer
 * kompakten Prompt-Zeile: Beschreibung + verfügbare Aktionen/Operationen.
 *
 * Damit kann der Coach/Resolver auch einen Node verstehen, den er noch NIE gesehen hat —
 * er liest die Node-eigene Beschreibung statt sich auf Trainingswissen zu verlassen.
 */

import type { N8nNodeTypeDescription } from './n8n-catalog-types';

/** Liste der Operations-/Aktions-Labels eines Nodes (resource + operation-Optionen). */
export function nodeOperationSummary(node: N8nNodeTypeDescription, max = 8): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const prop of node.properties || []) {
    if (prop.name !== 'operation' && prop.name !== 'resource') continue;
    if (!Array.isArray(prop.options)) continue;
    for (const o of prop.options) {
      const label = (o.action || o.name || '').toString().trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      out.push(label);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/**
 * Kompakte Selbst-Beschreibung eines Nodes für den Prompt:
 * "Displayname — <Beschreibung> — Aktionen: a, b, c".
 */
export function describeNodeForPrompt(
  node: N8nNodeTypeDescription,
  opts?: { maxDescLen?: number; maxOps?: number },
): string {
  const descLen = opts?.maxDescLen ?? 140;
  const raw = (node.description || node.subtitle || '').replace(/\s+/g, ' ').trim();
  const desc = raw.length > descLen ? `${raw.slice(0, descLen - 1)}…` : raw;
  const ops = nodeOperationSummary(node, opts?.maxOps ?? 8);

  const parts: string[] = [];
  if (desc) parts.push(desc);
  if (ops.length) parts.push(`Aktionen: ${ops.join(', ')}`);
  return parts.join(' — ');
}

/** Prompt-Zeile für einen Kandidaten-Node: "- type (Displayname) — <doc>". */
export function candidateLine(node: N8nNodeTypeDescription | undefined, name: string, displayName: string): string {
  const doc = node ? describeNodeForPrompt(node) : '';
  return doc ? `- ${name} (${displayName}) — ${doc}` : `- ${name} (${displayName})`;
}
