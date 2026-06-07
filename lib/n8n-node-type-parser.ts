/**
 * Parst n8n MCP get_node_types TypeScript-Definitionen für Property-Optionen.
 */

import type { N8nPropertyOption } from './n8n-catalog-types';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Union-Literale aus einer Property-Zeile extrahieren: 'GET' | 'POST' | … */
export function parsePropertyOptionsFromDefinitions(
  definitions: string,
  propertyName: string,
): N8nPropertyOption[] {
  if (!definitions?.trim() || !propertyName) return [];

  const propRe = new RegExp(
    `(?:/\\*\\*[\\s\\S]*?\\*/\\s*)?\\b${escapeRegExp(propertyName)}\\??:\\s*([^;\\n]+)`,
    'm',
  );
  const match = definitions.match(propRe);
  if (!match?.[1]) return [];

  const typeExpr = match[1].trim();
  const literals = [...typeExpr.matchAll(/'([^']+)'/g)].map(m => m[1]);
  const unique = [...new Set(literals)];

  return unique.map(value => ({
    name: value.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    value,
  }));
}

/** Node-Block für einen n8nType aus dem definitions-String schneiden. */
export function sliceNodeDefinitions(definitions: string, nodeType: string): string {
  const marker = `## ${nodeType}`;
  const start = definitions.indexOf(marker);
  if (start < 0) return definitions;
  const next = definitions.indexOf('\n## ', start + marker.length);
  return next < 0 ? definitions.slice(start) : definitions.slice(start, next);
}
