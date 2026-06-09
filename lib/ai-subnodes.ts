/**
 * AI-Sub-Node-Verbindungen (n8n-LangChain): AI Agent / Chains brauchen Sub-Nodes,
 * die über Spezial-Connections (ai_languageModel / ai_memory / ai_tool) andocken.
 */

import type { N8nCatalogIndexEntry } from '@/lib/n8n-catalog-types';
import { stepTypeFromCatalogEntry } from '@/lib/n8n-categories';
import { shortLabel } from '@/lib/short-label';
import type { WorkflowEdge, WorkflowStep } from '@/lib/types';

export type AiSlot = {
  slot: string;
  label: string;
  required: boolean;
  max: number;
  defaultNode: string;
};

const LC = '@n8n/n8n-nodes-langchain.';

/** Slot-Definitionen pro AI-Parent-Node (Chat Model*, Memory, Tool …). */
const AI_PARENT_SLOTS: Record<string, AiSlot[]> = {
  [`${LC}agent`]: [
    { slot: 'ai_languageModel', label: 'Chat Model', required: true, max: 1, defaultNode: `${LC}lmChatOpenAi` },
    { slot: 'ai_memory', label: 'Memory', required: false, max: 1, defaultNode: `${LC}memoryBufferWindow` },
    { slot: 'ai_tool', label: 'Tool', required: false, max: 8, defaultNode: `${LC}toolHttpRequest` },
  ],
  [`${LC}chainSummarization`]: [
    { slot: 'ai_languageModel', label: 'Model', required: true, max: 1, defaultNode: `${LC}lmChatOpenAi` },
  ],
  [`${LC}chainLlm`]: [
    { slot: 'ai_languageModel', label: 'Model', required: true, max: 1, defaultNode: `${LC}lmChatOpenAi` },
  ],
};

export const AI_CONNECTION_TYPES = new Set([
  'ai_languageModel', 'ai_memory', 'ai_tool', 'ai_embedding', 'ai_outputParser',
]);

export function aiSlotsFor(n8nType?: string | null): AiSlot[] {
  return n8nType ? AI_PARENT_SLOTS[n8nType] ?? [] : [];
}

export function isAiParent(n8nType?: string | null): boolean {
  return aiSlotsFor(n8nType).length > 0;
}

export function isAiConnection(connectionType?: string | null): boolean {
  return !!connectionType && AI_CONNECTION_TYPES.has(connectionType);
}

/**
 * Sub-Node-only Typen (Chat Models, Memory, Tools, Embeddings) — geben KEINEN main-Output aus,
 * dürfen also NICHT als eigenständige Haupt-Node verwendet werden (z.B. Mistral „lmChatMistralCloud"
 * funktioniert nur als Chat Model an einem Agent/Basic LLM Chain).
 */
export function isSubNodeOnlyType(n8nType?: string | null): boolean {
  if (!n8nType) return false;
  const short = n8nType.split('.').pop() || '';
  return /^(lm[A-Z]|lmChat|memory|tool[A-Z]|embeddings|outputParser|retriever|vectorStore|textSplitter|documentDefaultDataLoader)/.test(short);
}

/** Standalone-Ersatz für einen Haupt-AI-Schritt, der fälschlich auf einen Sub-Node zeigt. */
export const STANDALONE_AI_NODE = '@n8n/n8n-nodes-langchain.openAi';

/** Kurzer deutscher Default-Name für eine Sub-Node. */
export function subNodeLabel(slot: string): string {
  if (slot === 'ai_languageModel') return 'Chat Model';
  if (slot === 'ai_memory') return 'Memory';
  if (slot === 'ai_tool') return 'Tool';
  return 'Sub-Node';
}

/** Katalog-Einträge, die als Sub-Node in einen Slot passen (per Output-Typ am Namen erkannt). */
export function slotCandidates(slot: string, index: N8nCatalogIndexEntry[]): N8nCatalogIndexEntry[] {
  const short = (e: N8nCatalogIndexEntry) => e.name.split('.').pop() || '';
  if (slot === 'ai_languageModel') return index.filter(e => /^lm([A-Z]|Chat)/.test(short(e)));
  if (slot === 'ai_memory') return index.filter(e => /^memory/.test(short(e)));
  if (slot === 'ai_tool') return index.filter(e => /^tool/.test(short(e)) || /VectorStore$/.test(short(e)));
  return [];
}

/** Wie viele Sub-Nodes hängen aktuell in einem Slot. */
export function subNodeCount(parent: WorkflowStep, slot: string): number {
  return parent.aiSubNodes?.[slot]?.length ?? 0;
}

/** Sub-Node an einen AI-Parent (Agent/Chain) andocken. */
export function attachSubNode(
  steps: WorkflowStep[],
  edges: WorkflowEdge[],
  parentId: string,
  slot: string,
  entry: N8nCatalogIndexEntry,
): { steps: WorkflowStep[]; edges: WorkflowEdge[]; subId: string } {
  const parent = steps.find(s => s.id === parentId);
  if (!parent) return { steps, edges, subId: '' };

  const slotDef = aiSlotsFor(parent.n8nType).find(s => s.slot === slot);
  if (!slotDef) return { steps, edges, subId: '' };

  const existingIds = parent.aiSubNodes?.[slot] ?? [];
  if (existingIds.length >= slotDef.max) return { steps, edges, subId: '' };

  const subId = `sub-${slot.replace(/[^a-z]/gi, '')}-${Date.now()}`;
  const subStep: WorkflowStep = {
    id: subId,
    label: shortLabel(entry.displayName, { n8nType: entry.name }),
    type: stepTypeFromCatalogEntry(entry),
    n8nType: entry.name,
    n8nTypeVersion: entry.version,
    tool: entry.name.split('.').pop(),
    credentialType: entry.credentialTypes[0],
    subNodeOf: { parentId, slot },
    note: `${subNodeLabel(slot)} für „${parent.label}"`,
  };

  let nextSteps = [...steps, subStep];
  let nextEdges = [...edges];

  // max=1 Slots: alten Sub-Node ersetzen.
  if (slotDef.max === 1 && existingIds.length > 0) {
    const remove = new Set(existingIds);
    nextSteps = nextSteps.filter(s => !remove.has(s.id));
    nextEdges = nextEdges.filter(
      e => !(e.connectionType === slot && e.target === parentId && remove.has(e.source)),
    );
  }

  const updatedParent: WorkflowStep = {
    ...parent,
    aiSubNodes: {
      ...parent.aiSubNodes,
      [slot]: slotDef.max === 1 ? [subId] : [...existingIds, subId],
    },
  };
  nextSteps = nextSteps.map(s => (s.id === parentId ? updatedParent : s));

  nextEdges.push({
    id: `e-ai-${subId}-${parentId}-${slot}`,
    source: subId,
    target: parentId,
    connectionType: slot,
  });

  return { steps: nextSteps, edges: nextEdges, subId };
}

/** aiSubNodes / subNodeOf aus AI-Edges ableiten (Drag-Verbindungen + Konsistenz). */
export function syncAiGraphMeta(
  steps: WorkflowStep[],
  edges: WorkflowEdge[],
): WorkflowStep[] {
  const incomingAi = new Map<string, { parentId: string; slot: string }>();
  const parentSlots = new Map<string, Record<string, string[]>>();

  for (const e of edges) {
    if (!e.connectionType || !isAiConnection(e.connectionType)) continue;
    incomingAi.set(e.source, { parentId: e.target, slot: e.connectionType });
    const slots = parentSlots.get(e.target) ?? {};
    const arr = slots[e.connectionType] ?? [];
    if (!arr.includes(e.source)) arr.push(e.source);
    slots[e.connectionType] = arr;
    parentSlots.set(e.target, slots);
  }

  return steps.map(s => {
    const asSub = incomingAi.get(s.id);
    const asParent = parentSlots.get(s.id);
    let next = s;
    if (asSub) next = { ...next, subNodeOf: asSub };
    else if (next.subNodeOf) {
      const { subNodeOf: _, ...rest } = next;
      next = rest as WorkflowStep;
    }
    if (asParent && aiSlotsFor(s.n8nType).length > 0) {
      next = { ...next, aiSubNodes: asParent };
    } else if (aiSlotsFor(s.n8nType).length > 0 && next.aiSubNodes) {
      const { aiSubNodes: _, ...rest } = next;
      next = rest as WorkflowStep;
    }
    return next;
  });
}

/** Default-Katalog-Node für einen Slot (z. B. OpenAI Chat Model). */
export function defaultEntryForSlot(
  slot: string,
  index: N8nCatalogIndexEntry[],
): N8nCatalogIndexEntry | undefined {
  const candidates = slotCandidates(slot, index);
  const fallback = [
    ...aiSlotsFor(`${LC}agent`),
    ...aiSlotsFor(`${LC}chainSummarization`),
    ...aiSlotsFor(`${LC}chainLlm`),
  ].find(s => s.slot === slot)?.defaultNode;
  return candidates.find(e => e.name === fallback) ?? candidates[0];
}
