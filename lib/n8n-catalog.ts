/**
 * n8n catalog service — nodes.json + credentials.json from n8n instance or bundled npm packages.
 * Server-only; use /api/n8n/catalog from the client.
 */

import type {
  N8nCatalogIndexEntry,
  N8nCatalogSnapshot,
  N8nCredentialTypeDescription,
  N8nNodeTypeDescription,
} from './n8n-catalog-types';
import { buildCatalogIndex } from './n8n-categories';
import { getMockCatalog } from './n8n-catalog-mock';
import { resolveNodeVersion } from './n8n-categories';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const N8N_NODES_BASE_VERSION = process.env.N8N_NODES_BASE_VERSION || '2.15.1';
const N8N_LANGCHAIN_VERSION = process.env.N8N_LANGCHAIN_VERSION || '2.23.0';

let cached: N8nCatalogSnapshot | null = null;
let cachedAt = 0;
let cachedIndex: N8nCatalogIndexEntry[] | null = null;

function publicBase(): string {
  const url = process.env.N8N_PUBLIC_URL || process.env.N8N_API_URL?.replace(/\/api\/v1\/?$/, '') || 'http://localhost:5678';
  return url.replace(/\/$/, '');
}

function isMock(): boolean {
  return process.env.MOCK_N8N === 'true';
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`Fetch ${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

function asArray<T>(raw: T[] | Record<string, T> | null | undefined): T[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : Object.values(raw);
}

function normalizeTypeName(name: string, prefix: string): string {
  if (name.includes('.') || name.includes('/')) return name;
  return `${prefix}${name}`;
}

function normalizeNode(node: N8nNodeTypeDescription, prefix: string): N8nNodeTypeDescription {
  return {
    ...node,
    name: normalizeTypeName(node.name, prefix),
    properties: node.properties || [],
  };
}

function normalizeCredential(
  cred: N8nCredentialTypeDescription,
  prefix: string,
): N8nCredentialTypeDescription {
  return {
    ...cred,
    name: normalizeTypeName(cred.name, prefix),
    properties: cred.properties || [],
  };
}

/** n8n ships multiple versions per short name — keep highest version only. */
function dedupeNodesByName(nodes: N8nNodeTypeDescription[]): N8nNodeTypeDescription[] {
  const byName = new Map<string, N8nNodeTypeDescription>();
  for (const node of nodes) {
    const existing = byName.get(node.name);
    const ver = resolveNodeVersion(node.version);
    if (!existing || ver > resolveNodeVersion(existing.version)) {
      byName.set(node.name, node);
    }
  }
  return Array.from(byName.values());
}

/** Fetch full catalog from published n8n npm packages (unpkg CDN). */
async function fetchBundledCatalog(): Promise<N8nCatalogSnapshot> {
  const baseUrl = `https://unpkg.com/n8n-nodes-base@${N8N_NODES_BASE_VERSION}`;
  const lcUrl = `https://unpkg.com/@n8n/n8n-nodes-langchain@${N8N_LANGCHAIN_VERSION}`;

  const [baseNodesRaw, baseCredsRaw, lcNodesRaw, lcCredsRaw] = await Promise.all([
    fetchJson<N8nNodeTypeDescription[] | Record<string, N8nNodeTypeDescription>>(
      `${baseUrl}/dist/types/nodes.json`,
    ),
    fetchJson<N8nCredentialTypeDescription[] | Record<string, N8nCredentialTypeDescription>>(
      `${baseUrl}/dist/types/credentials.json`,
    ),
    fetchJson<N8nNodeTypeDescription[] | Record<string, N8nNodeTypeDescription>>(
      `${lcUrl}/dist/types/nodes.json`,
    ).catch(() => [] as N8nNodeTypeDescription[]),
    fetchJson<N8nCredentialTypeDescription[] | Record<string, N8nCredentialTypeDescription>>(
      `${lcUrl}/dist/types/credentials.json`,
    ).catch(() => [] as N8nCredentialTypeDescription[]),
  ]);

  const nodes = dedupeNodesByName([
    ...asArray(baseNodesRaw).map(n => normalizeNode(n, 'n8n-nodes-base.')),
    ...asArray(lcNodesRaw).map(n => normalizeNode(n, '@n8n/n8n-nodes-langchain.')),
  ]);
  const credentials = [
    ...asArray(baseCredsRaw).map(c => normalizeCredential(c, 'n8n-nodes-base.')),
    ...asArray(lcCredsRaw).map(c => normalizeCredential(c, '@n8n/n8n-nodes-langchain.')),
  ];

  console.info(`[n8n-catalog] bundled catalog: ${nodes.length} nodes, ${credentials.length} credentials`);

  return {
    nodes,
    credentials,
    fetchedAt: new Date().toISOString(),
    source: 'bundled',
  };
}

/** Load full catalog (cached 24h in-process). */
export async function getN8nCatalog(force = false): Promise<N8nCatalogSnapshot> {
  if (!force && cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;

  if (isMock()) {
    cached = getMockCatalog();
    cachedAt = Date.now();
    cachedIndex = buildCatalogIndex(cached.nodes);
    return cached;
  }

  const base = publicBase();
  try {
    const [nodesRaw, credsRaw] = await Promise.all([
      fetchJson<N8nNodeTypeDescription[]>(`${base}/types/nodes.json`),
      fetchJson<N8nCredentialTypeDescription[]>(`${base}/types/credentials.json`),
    ]);
    const nodes = dedupeNodesByName(asArray(nodesRaw).map(n => ({
      ...n,
      properties: n.properties || [],
    })));
    if (nodes.length < 50) throw new Error(`Live catalog too small (${nodes.length} nodes)`);

    cached = {
      nodes,
      credentials: asArray(credsRaw),
      fetchedAt: new Date().toISOString(),
      source: 'live',
    };
    cachedAt = Date.now();
    cachedIndex = buildCatalogIndex(cached.nodes);
    console.info(`[n8n-catalog] live catalog: ${cached.nodes.length} nodes`);
    return cached;
  } catch (liveErr) {
    console.warn('[n8n-catalog] live fetch failed, trying bundled npm catalog:', liveErr);
  }

  try {
    cached = await fetchBundledCatalog();
    cachedAt = Date.now();
    cachedIndex = buildCatalogIndex(cached.nodes);
    return cached;
  } catch (bundledErr) {
    console.error('[n8n-catalog] bundled fetch failed, falling back to mock:', bundledErr);
    cached = getMockCatalog();
    cachedAt = Date.now();
    cachedIndex = buildCatalogIndex(cached.nodes);
    return cached;
  }
}

export async function getCatalogIndex(force = false): Promise<N8nCatalogIndexEntry[]> {
  if (!force && cachedIndex && cached && Date.now() - cachedAt < CACHE_TTL_MS) return cachedIndex;
  const catalog = await getN8nCatalog(force);
  cachedIndex = buildCatalogIndex(catalog.nodes);
  return cachedIndex;
}

export function getNodeByName(
  catalog: N8nCatalogSnapshot,
  typeName: string,
): N8nNodeTypeDescription | undefined {
  return catalog.nodes.find(n => n.name === typeName);
}

export function getCredentialByName(
  catalog: N8nCatalogSnapshot,
  typeName: string,
): N8nCredentialTypeDescription | undefined {
  return catalog.credentials.find(c => c.name === typeName || c.name.endsWith(`.${typeName}`));
}

/** Default parameters from n8n property defaults. */
export function buildDefaultParameters(node: N8nNodeTypeDescription): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const prop of node.properties || []) {
    if (prop.default !== undefined && prop.name) {
      params[prop.name] = prop.default;
    }
  }
  return params;
}

/** Resolve icon URL on the n8n instance (for proxy). */
export function resolveN8nIconUrl(iconRef: string | undefined): string | null {
  if (!iconRef) return null;
  if (iconRef.startsWith('file:')) return `${publicBase()}/icons/${iconRef.slice(5)}`;
  return null;
}

// n8n's built-in pseudo-icons have NO file in the node packages:
//  - `fa:<name>`   → FontAwesome glyph (n8n uses FontAwesome Free **v5** names)
//  - `node:<name>` → n8n editor's own icon set (design-system package)
// We resolve them to their real upstream SVGs so they render like in n8n.
const FA5_SOLID = 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5/svgs/solid';
const N8N_NODE_ICONS =
  'https://cdn.jsdelivr.net/gh/n8n-io/n8n@2.23.4/packages/frontend/@n8n/design-system/src/components/N8nIcon/nodes';

/** Build a CDN URL for a catalog icon path (FontAwesome, n8n node-icon set, or npm node packages). */
export function resolveBundledIconUrl(iconPath: string): string | null {
  // FontAwesome pseudo-icons: fa/map-signs.svg (IF), fa/pen.svg (Set), fa/clock.svg (Schedule), …
  if (iconPath.startsWith('fa/')) {
    return `${FA5_SOLID}/${iconPath.slice(3)}`;
  }
  // n8n built-in node-icon set: node/ai-agent.svg (AI Agent), node/no-operation.svg, …
  if (iconPath.startsWith('node/')) {
    return `${N8N_NODE_ICONS}/${iconPath.slice(5)}`;
  }
  if (iconPath.startsWith('@n8n/n8n-nodes-langchain/dist/')) {
    return `https://unpkg.com/@n8n/n8n-nodes-langchain@${N8N_LANGCHAIN_VERSION}/${iconPath.replace(/^@n8n\/n8n-nodes-langchain\//, '')}`;
  }
  if (iconPath.startsWith('n8n-nodes-base/dist/')) {
    return `https://unpkg.com/n8n-nodes-base@${N8N_NODES_BASE_VERSION}/${iconPath.replace(/^n8n-nodes-base\//, '')}`;
  }
  return null;
}

export function getNodeVersion(node: N8nNodeTypeDescription): number {
  return resolveNodeVersion(node.version);
}

export { publicBase as getN8nPublicBase };
