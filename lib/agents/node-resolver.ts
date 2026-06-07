/**
 * NodeResolver Agent — maps abstract Klaro steps → concrete n8n node types.
 */

import type { WorkflowStep } from '@/lib/types';
import type { N8nCatalogIndexEntry, NodeResolverResult } from '@/lib/n8n-catalog-types';
import { buildDefaultParameters, getNodeByName, getN8nCatalog, getCatalogIndex } from '@/lib/n8n-catalog';
import { searchCatalogIndex } from '@/lib/n8n-categories';
import { type CompleteJson, safeParseJson } from '@/lib/agents/llm';

export interface NodeResolverInput {
  steps: WorkflowStep[];
  context?: {
    useCaseTitle?: string;
    painPoint?: string;
    tools?: string[];
    chatSnippet?: string;
  };
}

const GENERIC_NODES = new Set([
  'n8n-nodes-base.aiTransform',
  'n8n-nodes-base.noOp',
]);

function preferAiNode(index: N8nCatalogIndexEntry[]): N8nCatalogIndexEntry | undefined {
  return (
    index.find(e => e.name === '@n8n/n8n-nodes-langchain.openAi')
    ?? index.find(e => e.name === '@n8n/n8n-nodes-langchain.agent')
    ?? index.find(e => e.name === 'n8n-nodes-base.openAi')
    ?? index.find(e => e.displayName === 'OpenAI')
  );
}

function sanitizeResult(
  step: WorkflowStep,
  result: NodeResolverResult,
  index: N8nCatalogIndexEntry[],
): NodeResolverResult {
  if (GENERIC_NODES.has(result.n8n_type) && step.type === 'ai') {
    const preferred = preferAiNode(index);
    if (preferred) return { ...result, n8n_type: preferred.name, type_version: preferred.version };
  }
  return result;
}

function filterResolverCandidates(entries: N8nCatalogIndexEntry[]): N8nCatalogIndexEntry[] {
  return entries.filter(e => !GENERIC_NODES.has(e.name));
}

/** Deterministic fallback when LLM fails or for obvious step types. */
export function heuristicResolveStep(
  step: WorkflowStep,
  index: N8nCatalogIndexEntry[],
): NodeResolverResult | null {
  const label = (step.label || '').toLowerCase();
  const type = step.type || 'action';

  if (type === 'trigger') {
    if (/schedule|cron|täglich|stündlich|zeitplan/.test(label)) {
      const n = index.find(e => e.name === 'n8n-nodes-base.scheduleTrigger');
      if (n) return makeResult(step.id, n);
    }
    if (/webhook|api|http/.test(label)) {
      const n = index.find(e => e.name === 'n8n-nodes-base.webhook');
      if (n) return makeResult(step.id, n);
    }
    const n = index.find(e => e.name === 'n8n-nodes-base.manualTrigger');
    if (n) return makeResult(step.id, n);
  }

  if (type === 'ai' || /ki|gpt|openai|generier|analysier|zusammenfass|caption|video|reel|skript/.test(label)) {
    const n = preferAiNode(index);
    if (n) return makeResult(step.id, n);
  }

  if (type === 'decision' || /wenn|if|entscheid|prüf/.test(label)) {
    const n = index.find(e => e.name === 'n8n-nodes-base.if');
    if (n) return makeResult(step.id, n);
  }

  if (/gmail|email|mail|e-mail/.test(label)) {
    const n = index.find(e => e.name === 'n8n-nodes-base.gmail');
    if (n) return makeResult(step.id, n);
  }

  if (/slack|chat|nachricht/.test(label)) {
    const n = index.find(e => e.name === 'n8n-nodes-base.slack');
    if (n) return makeResult(step.id, n);
  }

  if (/http|api|request|webhook/.test(label)) {
    const n = index.find(e => e.name === 'n8n-nodes-base.httpRequest');
    if (n) return makeResult(step.id, n);
  }

  if (type === 'output' || /speicher|set|feld/.test(label)) {
    const n = index.find(e => e.name === 'n8n-nodes-base.set');
    if (n) return makeResult(step.id, n);
  }

  if (/meta|facebook|instagram|business suite/.test(label)) {
    const n = index.find(e => e.name === 'n8n-nodes-base.facebookGraphApi')
      ?? index.find(e => /facebook|instagram|meta/i.test(e.displayName));
    if (n) return makeResult(step.id, n);
  }

  if (/youtube|video/.test(label)) {
    const n = index.find(e => e.name === 'n8n-nodes-base.youTube');
    if (n) return makeResult(step.id, n);
  }

  return null;
}

function makeResult(stepId: string, entry: N8nCatalogIndexEntry): NodeResolverResult {
  return {
    step_id: stepId,
    n8n_type: entry.name,
    type_version: entry.version,
    parameters: {},
    credential_type: entry.credentialTypes[0],
    display_name: entry.displayName,
  };
}

/** Letzter Ausweg pro Step-Typ — jeder Schritt MUSS einen echten n8n-Node bekommen. */
const FALLBACK_BY_TYPE: Record<string, string> = {
  trigger: 'n8n-nodes-base.manualTrigger',
  ai: '@n8n/n8n-nodes-langchain.openAi',
  decision: 'n8n-nodes-base.if',
  output: 'n8n-nodes-base.set',
  action: 'n8n-nodes-base.httpRequest',
  human: 'n8n-nodes-base.set',
};

/** Garantiert einen konkreten Node — heuristik zuerst, sonst typ-basierter Default. */
function guaranteedResolveStep(
  step: WorkflowStep,
  index: N8nCatalogIndexEntry[],
): NodeResolverResult {
  const h = heuristicResolveStep(step, index);
  if (h) return h;
  const fallbackName = FALLBACK_BY_TYPE[step.type || 'action'] ?? 'n8n-nodes-base.httpRequest';
  const entry =
    index.find(e => e.name === fallbackName) ??
    index.find(e => e.name === 'n8n-nodes-base.httpRequest') ??
    index.find(e => e.name === 'n8n-nodes-base.set');
  if (entry) return makeResult(step.id, entry);
  // Absoluter Notfall: synthetischer Eintrag (Icon-Proxy kennt den Typ trotzdem).
  return {
    step_id: step.id,
    n8n_type: fallbackName,
    type_version: 1,
    parameters: {},
    credential_type: undefined,
    display_name: undefined,
  };
}

function buildResolverPrompt(
  steps: WorkflowStep[],
  candidates: N8nCatalogIndexEntry[],
  context?: NodeResolverInput['context'],
): { system: string; user: string } {
  const candidateList = candidates
    .slice(0, 50)
    .map(c => `- ${c.name} (${c.displayName}) [${c.klaroCategory}]`)
    .join('\n');

  const system = `Du bist der NodeResolver in Klaro — mappe abstrakte Workflow-Schritte auf konkrete n8n-Node-Typen.
Wähle NUR aus der Kandidatenliste. Antworte AUSSCHLIESSLICH mit JSON:
{"steps":[{"step_id":"...","n8n_type":"...","type_version":1,"parameters":{},"credential_type":"..."}]}
parameters: nur sinnvolle Defaults aus dem Schritt-Kontext (sonst leeres Objekt).
VERBOTEN für KI-Schritte: n8n-nodes-base.aiTransform — stattdessen @n8n/n8n-nodes-langchain.openAi oder passende App-Nodes.`;

  const user = `Kontext:
Use Case: ${context?.useCaseTitle || '—'}
Pain Point: ${context?.painPoint || '—'}
Tools: ${context?.tools?.join(', ') || '—'}

Schritte:
${JSON.stringify(steps.map(s => ({ id: s.id, label: s.label, type: s.type, tool: s.tool })), null, 2)}

Kandidaten-Nodes:
${candidateList}`;

  return { system, user };
}

export async function runNodeResolver(
  input: NodeResolverInput,
  complete?: CompleteJson,
): Promise<{ results: NodeResolverResult[]; source: 'llm' | 'heuristic' | 'mixed' }> {
  const catalog = await getN8nCatalog();
  const allIndex = await getCatalogIndex();

  const results: NodeResolverResult[] = [];
  let usedLlm = false;

  if (complete) {
    const keywords = [
      input.context?.useCaseTitle,
      input.context?.painPoint,
      ...(input.context?.tools || []),
      ...input.steps.map(s => s.label),
    ].filter(Boolean).join(' ');
    const candidates = filterResolverCandidates(searchCatalogIndex(allIndex, keywords, 50));
    if (candidates.length < 10) {
      candidates.push(...filterResolverCandidates(allIndex.slice(0, 40)));
    }
    const uniqueCandidates = Array.from(new Map(candidates.map(c => [c.name, c])).values());

    const { system, user } = buildResolverPrompt(input.steps, uniqueCandidates, input.context);
    try {
      const { content } = await complete({ system, user });
      const parsed = safeParseJson<{ steps?: NodeResolverResult[] }>(content);
      if (parsed?.steps?.length) {
        for (const step of input.steps) {
          const match = parsed.steps.find(s => s.step_id === step.id);
          // NUR akzeptieren, wenn der vom LLM gewählte Node WIRKLICH im Katalog existiert.
          // Sonst halluziniert das LLM Namen (z.B. metaBusinessSuite) → wir fallen auf die
          // garantierte Heuristik zurück, die nur echte Katalog-Nodes verwendet.
          const node = match?.n8n_type ? getNodeByName(catalog, match.n8n_type) : undefined;
          if (match?.n8n_type && node) {
            const raw: NodeResolverResult = {
              step_id: step.id,
              n8n_type: match.n8n_type,
              type_version: match.type_version ?? (Array.isArray(node.version) ? node.version[node.version.length - 1] : node.version),
              parameters: { ...buildDefaultParameters(node), ...(match.parameters || {}) },
              credential_type: match.credential_type || node?.credentials?.[0]?.name,
              display_name: node?.displayName,
            };
            results.push(sanitizeResult(step, raw, allIndex));
            usedLlm = true;
            continue;
          }
          if (match?.n8n_type && !node) {
            console.warn(`[node-resolver] LLM halluziniert nicht-existenten Node "${match.n8n_type}" für "${step.label}" → Heuristik-Fallback`);
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const rateLimited = /rate limit|429|too many requests/i.test(msg);
      console.error('[node-resolver] LLM failed:', rateLimited ? 'rate_limited' : msg);
    }
  }

  for (const step of input.steps) {
    if (results.some(r => r.step_id === step.id)) continue;
    const h = guaranteedResolveStep(step, allIndex);
    const node = getNodeByName(catalog, h.n8n_type);
    results.push(sanitizeResult(step, {
      ...h,
      parameters: node ? buildDefaultParameters(node) : {},
      credential_type: h.credential_type || node?.credentials?.[0]?.name,
    }, allIndex));
  }

  const sanitized = results.map(r => {
    const step = input.steps.find(s => s.id === r.step_id);
    const base = step ? sanitizeResult(step, r, allIndex) : r;
    // Letzte Validierung: existiert der Node-Typ wirklich im Katalog? Wenn nicht,
    // garantierten Heuristik-Node nehmen (echt) — kein "Node nicht im Katalog gefunden" mehr.
    if (getNodeByName(catalog, base.n8n_type)) return base;
    if (step) {
      const safe = guaranteedResolveStep(step, allIndex);
      const node = getNodeByName(catalog, safe.n8n_type);
      console.warn(`[node-resolver] "${base.n8n_type}" nicht im Katalog → ersetzt durch "${safe.n8n_type}"`);
      return {
        ...safe,
        parameters: node ? buildDefaultParameters(node) : {},
        credential_type: safe.credential_type || node?.credentials?.[0]?.name,
      };
    }
    return base;
  });

  return {
    results: sanitized,
    source: usedLlm ? (sanitized.length === input.steps.length ? 'llm' : 'mixed') : 'heuristic',
  };
}

/** Apply resolver output onto workflow steps — preserves existing n8nType unless forced. */
export function applyResolverToSteps(
  steps: WorkflowStep[],
  results: NodeResolverResult[],
  options?: { overwrite?: boolean },
): WorkflowStep[] {
  const overwrite = options?.overwrite ?? false;
  return steps.map(step => {
    if (!overwrite && step.n8nType && !GENERIC_NODES.has(step.n8nType)) return step;
    const r = results.find(x => x.step_id === step.id);
    if (!r) return step;
    return {
      ...step,
      n8nType: r.n8n_type,
      n8nTypeVersion: r.type_version,
      parameters: r.parameters,
      credentialType: r.credential_type,
      tool: r.n8n_type.split('.').pop() || step.tool,
    };
  });
}
