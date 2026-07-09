/**
 * AI-Sub-Node-Verbindungen (n8n-LangChain): AI Agent / Chains brauchen Sub-Nodes,
 * die über Spezial-Connections (ai_languageModel / ai_memory / ai_tool) andocken.
 */

import type { N8nCatalogIndexEntry } from '@/lib/n8n-catalog-types';
import { stepTypeFromCatalogEntry } from '@/lib/n8n-categories';
import { shortLabel } from '@/lib/short-label';
import { AXANTILO_AI_TOOL } from '@/lib/axantilo-llm-credential';
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
    // Default-Chat-Model = „Axantilo Chat Model" (lmChatOpenAi @ Axantilo-Proxy) — zentral
    // gemetert, kein Nutzer-Zugang nötig. Siehe attachSubNode() für die Sonderbehandlung
    // (tool/credentialType/Label/Modell-Parameter) und lib/axantilo-llm-credential.ts.
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
  [`${LC}informationExtractor`]: [
    { slot: 'ai_languageModel', label: 'Model', required: true, max: 1, defaultNode: `${LC}lmChatOpenAi` },
  ],
  [`${LC}textClassifier`]: [
    { slot: 'ai_languageModel', label: 'Model', required: true, max: 1, defaultNode: `${LC}lmChatOpenAi` },
  ],
  [`${LC}sentimentAnalysis`]: [
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

/** Mistral-Modell, das die Axantilo Chat Model-Sub-Node über den Proxy anspricht. */
function axantiloDefaultModelId(): string {
  return process.env.MISTRAL_CHAT_MODEL || 'mistral-small-latest';
}

/**
 * `parameters.model` für die Axantilo Chat Model-Sub-Node (lmChatOpenAi) — Shape hängt vom
 * n8n-typeVersion ab: ab 1.2 ist `model` ein resourceLocator-Objekt ({__rl,mode,value}),
 * davor ein simpler String. responsesApiEnabled MUSS false sein — unser Proxy spricht nur
 * Chat Completions, nicht OpenAIs Responses-API. WICHTIG: responsesApiEnabled ist ein
 * TOP-LEVEL-Parameter des lmChatOpenAi-Nodes, NICHT unter `options` — steht er unter options,
 * greift der Default (true) und n8n ruft /responses statt /chat/completions → 404 am Proxy.
 * Die Base-URL kommt aus der openAiApi-Credential (url), daher kein options.baseURL nötig.
 */
function axantiloChatModelParameters(version: number): Record<string, unknown> {
  const modelId = axantiloDefaultModelId();
  const model = version >= 1.2 ? { __rl: true, mode: 'id' as const, value: modelId } : modelId;
  return { model, responsesApiEnabled: false };
}

/**
 * Sub-Node an einen AI-Parent (Agent/Chain) andocken.
 * `isAxantiloDefault`: true, wenn dies der AUTOMATISCH angehängte Default-Chat-Model ist
 * (ensureRequiredSubNodes → defaultEntryForSlot) — dann zeigt die Sub-Node auf Axantilos
 * eigenen, gemeterten Proxy statt auf eine Nutzer-OpenAI-Credential.
 */
export function attachSubNode(
  steps: WorkflowStep[],
  edges: WorkflowEdge[],
  parentId: string,
  slot: string,
  entry: N8nCatalogIndexEntry,
  opts?: { isAxantiloDefault?: boolean },
): { steps: WorkflowStep[]; edges: WorkflowEdge[]; subId: string } {
  const parent = steps.find(s => s.id === parentId);
  if (!parent) return { steps, edges, subId: '' };

  const slotDef = aiSlotsFor(parent.n8nType).find(s => s.slot === slot);
  if (!slotDef) return { steps, edges, subId: '' };

  const existingIds = parent.aiSubNodes?.[slot] ?? [];
  if (existingIds.length >= slotDef.max) return { steps, edges, subId: '' };

  const isAxantiloDefault =
    !!opts?.isAxantiloDefault && slot === 'ai_languageModel' && entry.name === `${LC}lmChatOpenAi`;

  const subId = `sub-${slot.replace(/[^a-z]/gi, '')}-${Date.now()}`;
  const subStep: WorkflowStep = {
    id: subId,
    label: isAxantiloDefault ? 'Axantilo Chat Model' : shortLabel(entry.displayName, { n8nType: entry.name }),
    type: stepTypeFromCatalogEntry(entry),
    n8nType: entry.name,
    n8nTypeVersion: entry.version,
    tool: isAxantiloDefault ? AXANTILO_AI_TOOL : entry.name.split('.').pop(),
    credentialType: isAxantiloDefault ? 'openAiApi' : entry.credentialTypes[0],
    ...(isAxantiloDefault ? { parameters: axantiloChatModelParameters(entry.version) } : {}),
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
      next = { ...next };
      delete next.subNodeOf;
    }
    if (asParent && aiSlotsFor(s.n8nType).length > 0) {
      next = { ...next, aiSubNodes: asParent };
    } else if (aiSlotsFor(s.n8nType).length > 0 && next.aiSubNodes) {
      next = { ...next };
      delete next.aiSubNodes;
    }
    return next;
  });
}

/**
 * Stellt sicher, dass jeder AI-Parent (Agent/Chain) seine PFLICHT-Sub-Nodes hat (v.a. Chat Model).
 * Hängt fehlende Pflicht-Slots mit dem Default-Node aus dem Katalog an. Idempotent.
 */
export function ensureRequiredSubNodes(
  steps: WorkflowStep[],
  edges: WorkflowEdge[],
  index: N8nCatalogIndexEntry[],
): { steps: WorkflowStep[]; edges: WorkflowEdge[] } {
  let nextSteps = steps;
  let nextEdges = edges;
  // Über eine Kopie der Parent-IDs iterieren (attachSubNode verändert die Arrays).
  const parentIds = steps.filter(s => !s.subNodeOf && isAiParent(s.n8nType)).map(s => s.id);
  for (const parentId of parentIds) {
    const parent = nextSteps.find(s => s.id === parentId);
    if (!parent) continue;
    for (const slot of aiSlotsFor(parent.n8nType)) {
      if (!slot.required) continue;
      if (subNodeCount(parent, slot.slot) > 0) continue;
      const entry = defaultEntryForSlot(slot.slot, index);
      if (!entry) continue;
      // Auto-angehängt = Axantilo-Default (Chat Model → unser gemeterter Proxy).
      const res = attachSubNode(nextSteps, nextEdges, parentId, slot.slot, entry, { isAxantiloDefault: true });
      if (res.subId) {
        nextSteps = res.steps;
        nextEdges = res.edges;
      }
    }
  }
  return { steps: nextSteps, edges: nextEdges };
}

/**
 * Stellt sicher, dass jeder AI-Sub-Node (v.a. Chat Model) GENAU EINEN Parent hat.
 * Wenn ein Sub-Node an mehrere Agenten/Chains hängt (z.B. ein geteiltes Mistral-Modell),
 * wird er für jeden weiteren Parent geklont — n8n erlaubt kein Teilen eines Sub-Nodes.
 */
export function splitSharedAiSubNodes(
  steps: WorkflowStep[],
  edges: WorkflowEdge[],
): { steps: WorkflowStep[]; edges: WorkflowEdge[] } {
  // Pro Sub-Node (source) die AI-Edges sammeln.
  const bySource = new Map<string, WorkflowEdge[]>();
  for (const e of edges) {
    if (!isAiConnection(e.connectionType)) continue;
    const arr = bySource.get(e.source) ?? [];
    arr.push(e);
    bySource.set(e.source, arr);
  }

  let nextSteps = [...steps];
  let nextEdges = [...edges];

  for (const [sourceId, aiEdges] of bySource) {
    if (aiEdges.length <= 1) continue; // nicht geteilt
    const original = nextSteps.find(s => s.id === sourceId);
    if (!original) continue;

    // Ersten Parent beim Original lassen, ab dem zweiten klonen.
    for (let i = 1; i < aiEdges.length; i++) {
      const edge = aiEdges[i];
      const cloneId = `${sourceId}-clone-${i}-${Math.random().toString(36).slice(2, 6)}`;
      const clone: WorkflowStep = {
        ...original,
        id: cloneId,
        subNodeOf: edge.connectionType
          ? { parentId: edge.target, slot: edge.connectionType }
          : original.subNodeOf,
      };
      nextSteps.push(clone);
      nextEdges = nextEdges.map(e => (e === edge ? { ...e, source: cloneId } : e));
    }
  }

  // aiSubNodes/subNodeOf nach dem Split neu ableiten.
  nextSteps = syncAiGraphMeta(nextSteps, nextEdges);
  return { steps: nextSteps, edges: nextEdges };
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
