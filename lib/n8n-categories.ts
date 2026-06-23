/**
 * Top-level n8n node picker categories — mirrors n8n "What happens next?" buckets.
 */

import type { N8nCatalogIndexEntry, N8nNodeTypeDescription } from './n8n-catalog-types';

export type AxantiloN8nCategory =
  | 'ai'
  | 'action'
  | 'data'
  | 'flow'
  | 'core'
  | 'human'
  | 'trigger';

export type AxantiloN8nCategoryMeta = {
  id: AxantiloN8nCategory;
  label: string;
  /** Kurzbeschreibung in der Kategorieliste */
  pickerDescription: string;
  description: string;
};

/** Reihenfolge wie n8n „What happens next?“ */
export const AXANTILO_N8N_CATEGORY_ORDER: AxantiloN8nCategory[] = [
  'ai',
  'action',
  'data',
  'flow',
  'core',
  'human',
  'trigger',
];

export const AXANTILO_N8N_CATEGORIES: AxantiloN8nCategoryMeta[] = [
  {
    id: 'ai',
    label: 'KI',
    pickerDescription: 'Agents bauen, Dokumente zusammenfassen oder durchsuchen, …',
    description: 'OpenAI, Gemini, LangChain, …',
  },
  {
    id: 'action',
    label: 'Aktion in einer App',
    pickerDescription: 'Etwas in Google Sheets, Slack, Notion oder einem CRM erledigen',
    description: 'Gmail, Slack, Notion, CRM, …',
  },
  {
    id: 'data',
    label: 'Datenumwandlung',
    pickerDescription: 'Daten filtern, umwandeln oder anreichern',
    description: 'Set, Code, Aggregate, …',
  },
  {
    id: 'flow',
    label: 'Flow',
    pickerDescription: 'Verzweigen, zusammenführen oder Schleifen im Ablauf',
    description: 'If, Switch, Merge, Wait, …',
  },
  {
    id: 'core',
    label: 'Kern',
    pickerDescription: 'Code ausführen, HTTP-Requests, Webhooks setzen, …',
    description: 'HTTP, Webhook, Schedule, …',
  },
  {
    id: 'human',
    label: 'Freigabe',
    pickerDescription: 'Freigabe z. B. per Slack oder Telegram vor kritischen Schritten',
    description: 'Freigabe, Warten, Benachrichtigung',
  },
  {
    id: 'trigger',
    label: 'Trigger',
    pickerDescription: 'Startet den Workflow — Manual, Webhook, Schedule, …',
    description: 'Manual, Webhook, Schedule, …',
  },
];

export function pickerCategoriesForMode(
  filterMode: 'all' | 'trigger-only' | 'no-trigger',
): AxantiloN8nCategoryMeta[] {
  const ordered = AXANTILO_N8N_CATEGORY_ORDER.map(
    id => AXANTILO_N8N_CATEGORIES.find(c => c.id === id)!,
  );
  if (filterMode === 'trigger-only') {
    return ordered.filter(c => c.id === 'trigger');
  }
  if (filterMode === 'no-trigger') {
    return ordered.filter(c => c.id !== 'trigger');
  }
  return ordered;
}

const AI_PATTERNS = [
  /^@n8n\/n8n-nodes-langchain\./,
  /openai|gemini|anthropic|mistral|langchain|ai/i,
];

const FLOW_TYPES = new Set([
  'n8n-nodes-base.if',
  'n8n-nodes-base.switch',
  'n8n-nodes-base.merge',
  'n8n-nodes-base.wait',
  'n8n-nodes-base.splitInBatches',
  'n8n-nodes-base.noOp',
]);

const DATA_TYPES = new Set([
  'n8n-nodes-base.set',
  'n8n-nodes-base.code',
  'n8n-nodes-base.itemLists',
  'n8n-nodes-base.aggregate',
  'n8n-nodes-base.sort',
  'n8n-nodes-base.filter',
]);

const CORE_TYPES = new Set([
  'n8n-nodes-base.httpRequest',
  'n8n-nodes-base.webhook',
  'n8n-nodes-base.scheduleTrigger',
  'n8n-nodes-base.manualTrigger',
  'n8n-nodes-base.respondToWebhook',
]);

const TRIGGER_GROUPS = new Set(['trigger']);

function hasCategory(node: N8nNodeTypeDescription, cat: string): boolean {
  return (node.codex?.categories || []).some(c => c.toLowerCase().includes(cat.toLowerCase()));
}

/** Classify a node into an Axantilo picker category. */
export function classifyNode(node: N8nNodeTypeDescription): AxantiloN8nCategory {
  const name = node.name || '';
  const groups = node.group || [];

  if (groups.some(g => TRIGGER_GROUPS.has(g))) return 'trigger';
  if (AI_PATTERNS.some(re => re.test(name)) || hasCategory(node, 'ai')) return 'ai';
  if (FLOW_TYPES.has(name) || /^(if|switch|merge|wait|split)/i.test(node.displayName)) return 'flow';
  if (DATA_TYPES.has(name) || hasCategory(node, 'data')) return 'data';
  if (CORE_TYPES.has(name)) return 'core';
  if (/human|approval|review|wait/i.test(node.displayName) || hasCategory(node, 'human')) return 'human';
  if (groups.includes('output') || groups.includes('transform')) return 'action';
  return 'core';
}

export function resolveNodeVersion(version: number | number[] | undefined): number {
  if (Array.isArray(version)) return version[version.length - 1] ?? 1;
  return version ?? 1;
}

function stripIconsPrefix(path: string): string {
  return path.replace(/^icons\//, '').replace(/^file:/, '');
}

const CORE_ICONS: Record<string, string> = {
  'if': 'node/if.svg',
  'switch': 'node/switch.svg',
  'merge': 'node/merge.svg',
  'manualtrigger': 'node/manual-trigger.svg',
  'scheduletrigger': 'node/schedule-trigger.svg',
  'webhook': 'node/webhook.svg',
  'httprequest': 'node/http-request.svg',
  'code': 'node/code.svg',
  'set': 'node/edit-fields.svg',
  'wait': 'node/wait.svg',
  'noop': 'node/no-operation.svg',
  'splitinbatches': 'node/split-out.svg',
};

export function resolveIconPath(
  iconOrNode: N8nNodeTypeDescription['icon'] | Pick<N8nNodeTypeDescription, 'icon' | 'iconUrl' | 'name'>,
): string | null {
  const iconUrl =
    typeof iconOrNode === 'object' && iconOrNode !== null && 'iconUrl' in iconOrNode
      ? iconOrNode.iconUrl
      : undefined;
  if (iconUrl) {
    if (typeof iconUrl === 'string') return stripIconsPrefix(iconUrl);
    if (iconUrl.light) return stripIconsPrefix(iconUrl.light);
  }

  const icon =
    typeof iconOrNode === 'object' && iconOrNode !== null && 'icon' in iconOrNode
      ? iconOrNode.icon
      : iconOrNode;
      
  if (!icon && typeof iconOrNode === 'object' && iconOrNode !== null && 'name' in iconOrNode) {
    const short = (iconOrNode.name?.split('.').pop() || iconOrNode.name)?.toLowerCase();
    if (short && CORE_ICONS[short]) return CORE_ICONS[short];
  }

  if (!icon) return null;
  if (typeof icon === 'string') {
    if (icon.startsWith('file:')) return stripIconsPrefix(icon);
    // n8n FontAwesome / built-in node icons (served at /icons/fa/… and /icons/node/…)
    if (icon.startsWith('fa:')) return `fa/${icon.slice(3)}.svg`;
    if (icon.startsWith('node:')) return `node/${icon.slice(5)}.svg`;
    return null;
  }
  if (typeof icon === 'object' && icon !== null && 'light' in icon) {
    return stripIconsPrefix((icon as { light: string }).light);
  }
  return null;
}

/** Build searchable catalog index from raw nodes.json entries. */
export function buildCatalogIndex(nodes: N8nNodeTypeDescription[]): N8nCatalogIndexEntry[] {
  return nodes.map(node => {
    const credentialTypes = (node.credentials || []).map(c => c.name);
    return {
      name: node.name,
      displayName: node.displayName,
      description: node.description,
      version: resolveNodeVersion(node.version),
      groups: node.group || [],
      categories: node.codex?.categories || [],
      aliases: node.codex?.alias || [],
      hasCredentials: credentialTypes.length > 0,
      credentialTypes,
      iconPath: resolveIconPath(node),
      axantiloCategory: classifyNode(node),
    };
  });
}

export function filterIndexByCategory(
  index: N8nCatalogIndexEntry[],
  category: AxantiloN8nCategory,
): N8nCatalogIndexEntry[] {
  return index.filter(e => e.axantiloCategory === category);
}

/** Infer Axantilo workflow step type from catalog entry. */
export function stepTypeFromCatalogEntry(
  entry: N8nCatalogIndexEntry,
): 'trigger' | 'action' | 'ai' | 'decision' | 'human' | 'output' {
  switch (entry.axantiloCategory) {
    case 'trigger': return 'trigger';
    case 'ai': return 'ai';
    case 'flow': return 'decision';
    case 'human': return 'human';
    case 'data': return 'output';
    default: return 'action';
  }
}

export function searchCatalogIndex(
  index: N8nCatalogIndexEntry[],
  query: string,
  limit = 50,
): N8nCatalogIndexEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return index.slice(0, limit);
  const scored = index
    .map(entry => {
      let score = 0;
      const dn = entry.displayName.toLowerCase();
      const nm = entry.name.toLowerCase();
      if (dn === q) score += 100;
      else if (dn.startsWith(q)) score += 50;
      else if (dn.includes(q)) score += 30;
      if (nm.includes(q)) score += 20;
      for (const a of entry.aliases) {
        const al = a.toLowerCase();
        if (al === q) score += 80;
        else if (al.includes(q)) score += 25;
      }
      return { entry, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(x => x.entry);
}
