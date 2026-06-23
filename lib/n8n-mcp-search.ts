/**
 * Parst MCP search_nodes-Ergebnisse in Axantilo-Katalog-Einträge.
 */

import type { N8nCatalogIndexEntry } from './n8n-catalog-types';

function inferAxantiloCategory(nodeType: string, displayName: string): string {
  if (isTriggerNodeType(nodeType)) return 'trigger';
  if (nodeType.includes('langchain') || /agent|openai|mistral|llm|embedding/i.test(displayName)) {
    return 'ai';
  }
  if (/if|switch|merge|split|wait|loop/i.test(nodeType) || /if|switch|merge/i.test(displayName)) {
    return 'flow';
  }
  return 'action';
}

function isTriggerNodeType(type: string): boolean {
  return /Trigger$|\.webhook$|\.mcpTrigger$|\.formTrigger$/.test(type);
}

/** Einzelnen Block „- node.type …“ parsen. */
export function parseMcpSearchNodesResults(text: string): N8nCatalogIndexEntry[] {
  if (!text?.trim()) return [];

  const entries: N8nCatalogIndexEntry[] = [];
  const seen = new Set<string>();

  const blockRe =
    /- ([^\n]+)\n\s+Display Name:\s*([^\n]+)\n\s+Version:\s*([^\n]+)(?:\n\s+Description:\s*([^\n]+))?/g;

  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text)) !== null) {
    const name = m[1].trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const displayName = m[2].trim();
    const versionRaw = m[3].trim();
    const version = parseFloat(versionRaw) || 1;
    const description = m[4]?.trim();

    entries.push({
      name,
      displayName,
      description,
      version,
      groups: [],
      categories: [],
      aliases: [],
      hasCredentials: false,
      credentialTypes: [],
      iconPath: null,
      axantiloCategory: inferAxantiloCategory(name, displayName),
    });
  }

  return entries;
}

/** Lokale + MCP-Suchergebnisse zusammenführen (MCP füllt Lücken). */
export function mergeCatalogSearchResults(
  local: N8nCatalogIndexEntry[],
  mcp: N8nCatalogIndexEntry[],
): N8nCatalogIndexEntry[] {
  const byName = new Map<string, N8nCatalogIndexEntry>();
  for (const e of local) byName.set(e.name, e);
  for (const e of mcp) {
    if (!byName.has(e.name)) byName.set(e.name, e);
  }
  return [...byName.values()];
}
