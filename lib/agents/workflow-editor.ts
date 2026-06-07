/**
 * Workflow Editor Agent — interprets chat requests and returns step/edge changes.
 */

import type { StepConfig, Workflow, WorkflowEdge, WorkflowStep } from '@/lib/types';
import {
  buildSetupGuides,
  enrichStepsWithSetup,
  formatCoachMessage,
  isCoachingIntent,
  nextOpenStepId,
} from '@/lib/workflow-setup-coach';
import { attachSubNode, defaultEntryForSlot, aiSlotsFor } from '@/lib/ai-subnodes';
import { getCatalogIndex, getNodeByName, getN8nCatalog } from '@/lib/n8n-catalog';
import { searchCatalogIndex } from '@/lib/n8n-categories';
import { buildInitialParameters } from '@/lib/n8n-parameter-utils';
import { type CompleteJson, safeParseJson } from '@/lib/agents/llm';
import { heuristicResolveStep } from '@/lib/agents/node-resolver';
import {
  createIfStep,
  createMergeStep,
  createSwitchStep,
  insertStepInGraph,
  removeStepFromGraph,
  mergeEdgesFromEdit,
  mergeStepsFromEdit,
  resolveWorkflowEdges,
  hasSameStepIds,
  withTriggerFirst,
} from '@/lib/workflow-graph';
import {
  buildWorkflowOverview,
  findSourceStepForSwap,
  flattenStepsForEditor,
  formatOverviewForPrompt,
  mainWorkflowSteps,
  stepNumber,
} from '@/lib/workflow-overview';
import {
  formatCoachContextBlock,
  type WorkflowEditorCoachContext,
} from '@/lib/workflow-editor-context';

/** Bekannte Ziel-Nodes für „Schritt N → X" / „ändere … zu X". */
const SWAP_TARGETS: [RegExp, string][] = [
  [/openai|gpt|chatgpt|\bki\b/, '@n8n/n8n-nodes-langchain.openAi'],
  [/mistral/, '@n8n/n8n-nodes-langchain.lmChatMistralCloud'],
  [/anthropic|claude/, '@n8n/n8n-nodes-langchain.lmChatAnthropic'],
  [/gemini/, '@n8n/n8n-nodes-langchain.lmChatGoogleGemini'],
  [/ai.?agent|agent/, '@n8n/n8n-nodes-langchain.agent'],
  [/gmail|e-?mail|mail/, 'n8n-nodes-base.gmail'],
  [/slack/, 'n8n-nodes-base.slack'],
  [/telegram/, 'n8n-nodes-base.telegram'],
  [/youtube/, 'n8n-nodes-base.youTube'],
  [/meta|facebook|instagram/, 'n8n-nodes-base.facebookGraphApi'],
  [/notion/, 'n8n-nodes-base.notion'],
  [/airtable/, 'n8n-nodes-base.airtable'],
  [/google\s?sheets?|sheets|tabelle/, 'n8n-nodes-base.googleSheets'],
  [/webhook/, 'n8n-nodes-base.webhook'],
  [/schedule|zeitplan|cron|täglich|stündlich/, 'n8n-nodes-base.scheduleTrigger'],
  [/code|javascript|script/, 'n8n-nodes-base.code'],
  [/set|feld setzen|daten setzen/, 'n8n-nodes-base.set'],
  [/http|api.?request|request/, 'n8n-nodes-base.httpRequest'],
];

/** Ziel-Node aus „… zu Slack", „→ OpenAI", „soll Gmail sein" extrahieren. */
function extractTargetClause(msg: string): string {
  const patterns = [
    /(?:zu|durch|mit|→|->|for)\s+(.+?)$/i,
    /soll\s+(.+?)\s+(?:sein|nutzen|werden|verwenden)/i,
    /ersetze\s+(?:.+?)\s+(?:durch|mit|zu)\s+(.+?)$/i,
    /(?:ändere|wechsle|tausche)\s+(?:.+?)\s+(?:zu|durch|mit)\s+(.+?)$/i,
  ];
  for (const re of patterns) {
    const m = msg.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return msg;
}

function resolveN8nTypeFromClause(clause: string, index: Awaited<ReturnType<typeof getCatalogIndex>>): string | null {
  const lower = clause.toLowerCase();
  for (const [re, n8nType] of SWAP_TARGETS) {
    if (re.test(lower)) return n8nType;
  }
  const hits = searchCatalogIndex(index, clause, 5);
  return hits[0]?.name ?? null;
}

function findStepIndex(steps: WorkflowStep[], step: WorkflowStep | undefined): number {
  if (!step) return -1;
  return steps.findIndex(s => s.id === step.id);
}

export interface WorkflowEditInput {
  workflow: Workflow;
  message: string;
  stepConfigs?: Record<string, StepConfig>;
  /** Gleicher Kontext wie Haupt-Chat (Onboarding, Canvas, Memory, Verlauf). */
  coachContext?: WorkflowEditorCoachContext;
}

export interface WorkflowEditResult {
  steps: WorkflowStep[];
  edges: WorkflowEdge[];
  message: string;
  changed: boolean;
  /** Vorgeschlagene Panel-Konfiguration pro Schritt (Parameter, Credentials-Typ). */
  stepConfigUpdates?: Record<string, Partial<StepConfig>>;
  /** Nächsten offenen Schritt im Canvas öffnen. */
  openStepId?: string;
  /** n8n MCP-Sync nach Deploy (Parameter/Graph). */
  mcpSynced?: boolean;
  mcpSyncNote?: string;
}

export function workflowStructureChanged(before: Workflow, after: Pick<WorkflowEditResult, 'steps' | 'edges'>): boolean {
  const idsBefore = before.steps.map(s => s.id).join('\0');
  const idsAfter = after.steps.map(s => s.id).join('\0');
  if (idsBefore !== idsAfter) return true;
  return JSON.stringify(before.edges ?? []) !== JSON.stringify(after.edges ?? []);
}

function stepNumFromMessage(msg: string): number | null {
  const m = msg.match(/schritt\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

async function applyHeuristicEdit(
  workflow: Workflow,
  message: string,
  stepConfigs?: Record<string, StepConfig>,
): Promise<WorkflowEditResult | null> {
  const msg = message.toLowerCase();
  let steps = [...workflow.steps];
  let edges = resolveWorkflowEdges(steps, workflow.edges);
  let changed = false;
  let reply = '';

  const stepNum = stepNumFromMessage(message);
  const targetClause = extractTargetClause(message);
  const isSwapIntent = /(ändere|wechsle|tausche|ersetze|change|swap|→|->|\bsoll\b)/.test(msg)
    && /(zu|durch|mit|→|->|soll|ersetze|to\b)/.test(msg);

  // Globaler Provider-Tausch (z.B. „OpenAI zu Mistral", „statt ChatGPT wieder Mistral")
  const globalProviderSwap =
    /(openai|gpt|chatgpt).*(zu|to|→|->).*(mistral)/i.test(message)
    || /(mistral).*(statt|instead|anstatt).*(openai|gpt|chatgpt)/i.test(message)
    || /(statt|anstatt|instead\s+of)\s+(openai|gpt|chatgpt).*(mistral)/i.test(message)
    || /(wieder|zurück|back\s+to)\s+mistral/i.test(message)
    || /(alle|jeden|jeder|every|sämtliche).*(schritt|step).*(mistral)/i.test(message)
    || /mistral.*(alle|jeden|jeder|every|sämtliche).*(schritt|step)/i.test(message);
  if (globalProviderSwap) {
    const index_ = await getCatalogIndex();
    const mistralType = resolveN8nTypeFromClause('mistral', index_);
    const openAiType = '@n8n/n8n-nodes-langchain.openAi';
    if (mistralType) {
      const catalog = await getN8nCatalog();
      const mistralDef = getNodeByName(catalog, mistralType);
      let swapCount = 0;
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const isOpenAi =
          s.n8nType === openAiType
          || s.n8nType?.toLowerCase().includes('openai')
          || s.tool === 'openAi'
          || s.tool === 'openai';
        if (!isOpenAi) continue;
        steps[i] = {
          ...s,
          n8nType: mistralType,
          n8nTypeVersion: mistralDef
            ? (Array.isArray(mistralDef.version) ? mistralDef.version.at(-1) : mistralDef.version) ?? 1
            : s.n8nTypeVersion,
          tool: mistralType.split('.').pop(),
          type: 'ai',
          credentialType: mistralDef?.credentials?.[0]?.name ?? s.credentialType,
        };
        swapCount++;
      }
      if (swapCount > 0) {
        changed = true;
        reply = `${swapCount} KI-Schritt${swapCount > 1 ? 'e' : ''} nutzen jetzt ${mistralDef?.displayName ?? 'Mistral'}.`;
      }
    }
  }
  const sourceStep = isSwapIntent
    ? findSourceStepForSwap(steps, message, stepNum, targetClause)
    : undefined;
  const index = sourceStep
    ? findStepIndex(steps, sourceStep)
    : (stepNum != null ? findStepIndex(steps, mainWorkflowSteps(steps)[stepNum - 1]) : -1);

  // Node swap for specific step (by number or by referenced label)
  if (isSwapIntent && index >= 0 && index < steps.length) {
    const index_ = await getCatalogIndex();
    const n8nType = resolveN8nTypeFromClause(targetClause, index_);
    if (n8nType && steps[index].n8nType !== n8nType) {
      const catalog = await getN8nCatalog();
      const nodeDef = getNodeByName(catalog, n8nType);
      const isAi = n8nType.includes('langchain');
      const isTrigger = /Trigger$|\.webhook$/.test(n8nType);
      steps[index] = {
        ...steps[index],
        n8nType,
        n8nTypeVersion: nodeDef
          ? (Array.isArray(nodeDef.version) ? nodeDef.version.at(-1) : nodeDef.version) ?? 1
          : steps[index].n8nTypeVersion,
        tool: n8nType.split('.').pop(),
        type: isAi ? 'ai' : isTrigger ? 'trigger' : steps[index].type,
        parameters: nodeDef
          ? { ...buildInitialParameters(nodeDef.properties || []), ...steps[index].parameters }
          : steps[index].parameters,
        credentialType: nodeDef?.credentials?.[0]?.name ?? steps[index].credentialType,
      };
      changed = true;
      const nr = stepNumber(steps, steps[index].id);
      reply = `Schritt ${nr}: „${steps[index].label}" nutzt jetzt ${nodeDef?.displayName ?? n8nType.split('.').pop()}.`;

      // AI Agent/Chain: Default Chat Model anhängen wenn noch keiner verbunden ist.
      if (aiSlotsFor(n8nType).some(s => s.required)) {
        const slot = aiSlotsFor(n8nType).find(s => s.required)!;
        const hasModel = (steps[index].aiSubNodes?.[slot.slot]?.length ?? 0) > 0;
        if (!hasModel) {
          const entry = defaultEntryForSlot(slot.slot, index_);
          if (entry) {
            const attached = attachSubNode(steps, edges, steps[index].id, slot.slot, entry);
            steps = attached.steps;
            edges = attached.edges;
            reply += ` ${slot.label} (${entry.displayName}) wurde automatisch verbunden.`;
          }
        }
      }
    }
  }

  // Insert Switch
  if (/switch\b|mehrere\s+(fälle|wege|routen)/.test(msg) && !changed) {
    const afterId = index >= 0 ? steps[index].id : steps[steps.length - 1]?.id;
    const result = insertStepInGraph(steps, edges, createSwitchStep(), { afterStepId: afterId });
    steps = result.steps;
    edges = result.edges;
    changed = true;
    reply = `Switch nach Schritt ${index >= 0 ? stepNum : steps.length - 1} eingefügt — verbinde Ausgänge im Canvas.`;
  }

  // Insert Merge
  if (/merge\b|zusammenfüh|zusammenführ/.test(msg) && !changed) {
    const afterId = index >= 0 ? steps[index].id : steps[steps.length - 1]?.id;
    const result = insertStepInGraph(steps, edges, createMergeStep(), { afterStepId: afterId });
    steps = result.steps;
    edges = result.edges;
    changed = true;
    reply = `Merge-Node eingefügt — verbinde mehrere Eingänge links am Node.`;
  }

  // Insert IF / branch
  if (/if\b|verzweig|else|wenn\s+.+\s+dann/.test(msg) && !changed) {
    const afterId = index >= 0 ? steps[index].id : steps[steps.length - 1]?.id;
    const result = insertStepInGraph(steps, edges, createIfStep(), { afterStepId: afterId });
    steps = result.steps;
    edges = result.edges;
    changed = true;
    reply = reply || `IF-Node eingefügt — verbinde Ja/Nein im Canvas.`;
  }

  // Add step at end
  if (/hinzufügen|einfügen|neuer schritt|füge.*(ein|hinzu)/.test(msg) && !changed) {
    reply = 'Wähle den Node über „+“ am Ende oder beschreibe den Schritt genauer (z.B. „Schritt 4 soll Slack sein“).';
  }

  // Remove step
  if (/entfernen|löschen|delete/.test(msg) && index >= 0 && index < steps.length) {
    const removed = steps[index].label;
    const result = removeStepFromGraph(steps, edges, steps[index].id);
    steps = result.steps;
    edges = result.edges;
    changed = true;
    reply = `Schritt „${removed}" entfernt.`;
  }

  if (!changed) return null;

  const wired = withTriggerFirst(steps, edges);
  return attachCoachResult(workflow, wired.steps, wired.edges, reply, true, stepConfigs);
}

async function attachCoachResult(
  workflow: Workflow,
  steps: WorkflowStep[],
  edges: WorkflowEdge[],
  headline: string,
  changed: boolean,
  stepConfigs?: Record<string, StepConfig>,
): Promise<WorkflowEditResult> {
  const configs = stepConfigs ?? {};
  const { steps: setupSteps, stepConfigUpdates } = await enrichStepsWithSetup(workflow, steps, configs);
  const mergedConfigs = {
    ...configs,
    ...Object.fromEntries(
      Object.entries(stepConfigUpdates).map(([id, c]) => [id, { configType: 'n8n' as const, ...c }]),
    ),
  };
  const guides = buildSetupGuides(workflow, mergedConfigs);

  return {
    steps: setupSteps,
    edges,
    message: formatCoachMessage(workflow, guides, headline),
    changed,
    stepConfigUpdates: Object.keys(stepConfigUpdates).length ? stepConfigUpdates : undefined,
    openStepId: nextOpenStepId(guides),
  };
}

async function applyCoachingOnly(
  workflow: Workflow,
  message: string,
  stepConfigs?: Record<string, StepConfig>,
): Promise<WorkflowEditResult> {
  const configs = stepConfigs ?? {};
  const { steps, stepConfigUpdates } = await enrichStepsWithSetup(
    workflow,
    workflow.steps,
    configs,
  );
  const edges = resolveWorkflowEdges(workflow.steps, workflow.edges);
  const guides = buildSetupGuides(workflow, {
    ...configs,
    ...Object.fromEntries(
      Object.entries(stepConfigUpdates).map(([id, c]) => [id, { configType: 'n8n' as const, ...c }]),
    ),
  });

  const webhookGuide = guides.find(g =>
    workflow.steps.find(s => s.id === g.stepId)?.n8nType === 'n8n-nodes-base.webhook',
  );
  let headline = 'Hier die Einrichtung für deinen Workflow:';
  if (/webhook/i.test(message) && webhookGuide) {
    headline = 'So richtest du den Webhook ein:';
  } else if (/credential|api|zugang/i.test(message)) {
    headline = 'So verbindest du die Zugänge:';
  }

  return {
    steps,
    edges,
    message: formatCoachMessage(workflow, guides, headline),
    changed: Object.keys(stepConfigUpdates).length > 0,
    stepConfigUpdates: Object.keys(stepConfigUpdates).length ? stepConfigUpdates : undefined,
    openStepId: nextOpenStepId(guides),
  };
}

async function applyLlmEdit(
  workflow: Workflow,
  message: string,
  complete: CompleteJson,
  stepConfigs?: Record<string, StepConfig>,
  coachContext?: WorkflowEditorCoachContext,
): Promise<WorkflowEditResult | null> {
  const index = await getCatalogIndex();
  const overview = await buildWorkflowOverview(workflow);
  const keywords = `${message} ${workflow.title} ${workflow.steps.map(s => s.label).join(' ')}`;
  const candidates = searchCatalogIndex(index, keywords, 40);

  const contextBlock = formatCoachContextBlock(coachContext);

  const system = `Du bist Klaro im Workflow-Editor — derselbe Coach wie im Haupt-Chat, nur dass du hier den geöffneten Workflow bearbeitest und antwortest.
Nutze den KLARO-KONTEXT (Firma, Memory, Pain Points, Haupt-Chat), um Anfragen korrekt zu verstehen — z.B. „wie besprochen", „statt ChatGPT Mistral", Schritt-Bezüge aus dem Gespräch.
Der User beschreibt Änderungen am Workflow.
Antworte NUR mit JSON:
{
  "message": "Kurze Bestätigung auf Deutsch",
  "steps": [{"id":"...","label":"...","type":"trigger|action|ai|decision|human|output","n8nType":"...","n8nTypeVersion":1,"note":"Deutsch: was dieser Schritt tut","parameters":{}}],
  "edges": [{"id":"e-a-b","source":"step-id-a","target":"step-id-b","branch":"default|true|false|switch-0","targetInput":0,"connectionType":"ai_languageModel"}],
  "step_configs": {"step-id": {"parameters": {"httpMethod":"POST","path":"klaro-mein-flow"}}}
}
REGELN:
- Schritt 1 MUSS type=trigger sein (manualTrigger, webhook oder scheduleTrigger).
- Kein Trigger in der Mitte — nur am Anfang.
- IF: n8n-nodes-base.if, edges branch true/false.
- Switch: n8n-nodes-base.switch, edges branch switch-0, switch-1, …
- Merge: n8n-nodes-base.merge, mehrere Edges auf target mit targetInput 0,1,2…
- Bestehende step-ids beibehalten wenn möglich.
- n8nType STRENG nur aus Kandidatenliste. Erfinde KEINE Node-Namen (wie "metaapi").
- Meta/Facebook/Instagram = n8n-nodes-base.facebookGraphApi
- note: kurzer deutscher Zwecktext pro Schritt (nicht die englische Node-Beschreibung).
- parameters: sinnvolle Defaults (resource/operation/mode) aus dem Katalog-Kontext.
- AI Agent (@n8n/n8n-nodes-langchain.agent): Sub-Nodes als eigene steps mit subNodeOf + connectionType-Edges.
- Node-Tausch („Schritt 2 soll Slack sein"): n8nType des betroffenen Schritts ändern, id beibehalten.
- edges: bei Node-Tausch oder Parameter-Änderung WEGLASSEN oder [] — bestehende Verbindungen bleiben erhalten.
- edges: nur mitsenden wenn du die Topologie wirklich änderst (neuer Schritt, IF/Switch, Löschen).
- step_configs: sinnvolle Parameter pro Schritt (Webhook: POST + path, Gmail: operation send, KI: model).
- message: Kurze Bestätigung PLUS konkrete nächste Schritte auf Deutsch (was User klicken/ausfüllen/deployen soll).
- Webhook: erkläre dass die URL erst nach Deploy in n8n sichtbar ist; Pfad jetzt schon setzen.
- Nutze step.note und Workflow-Kontext aus Phase 3 — User kennt den fachlichen Ablauf.
- Führe Konversationen/Rückfragen in "message" immer auf Deutsch.`;

  const user = `Workflow: ${workflow.title}

ÜBERSICHT (Schritt-Nummer = „Schritt N" in User-Anfragen):
${formatOverviewForPrompt(overview)}

Alle Schritte inkl. Sub-Nodes (JSON):
${JSON.stringify(flattenStepsForEditor(workflow.steps), null, 2)}

Aktuelle Edges:
${JSON.stringify(workflow.edges ?? [], null, 2)}

User-Anfrage: ${message}
${contextBlock}
Kandidaten-Nodes (nur diese n8nTypes verwenden):
${candidates.slice(0, 35).map(c => `- ${c.name} (${c.displayName})`).join('\n')}`;

  try {
    const { content } = await complete({ system, user });
    const parsed = safeParseJson<{
      message?: string;
      steps?: WorkflowStep[];
      edges?: WorkflowEdge[];
      step_configs?: Record<string, Partial<StepConfig>>;
    }>(content);
    if (!parsed?.steps?.length) return null;

    const catalog = await getN8nCatalog();
    const mapped = parsed.steps.map(s => {
      const prev = workflow.steps.find(p => p.id === s.id);
      // Position, note, vorhandene Felder bewahren; LLM-Felder (label/type/n8nType) gewinnen.
      let resolved: WorkflowStep = { ...prev, ...s, position: prev?.position, note: s.note ?? prev?.note };

      if (resolved.n8nType && !getNodeByName(catalog, resolved.n8nType)) {
        console.warn(`[workflow-editor] LLM halluziniert Node: ${resolved.n8nType} — nutze Heuristik-Fallback.`);
        resolved = { ...resolved, n8nType: undefined };
      }

      if (!resolved.n8nType) {
        const h = heuristicResolveStep({ ...resolved, label: resolved.label || prev?.label || '' }, index);
        if (h) {
          resolved = {
            ...resolved,
            n8nType: h.n8n_type,
            n8nTypeVersion: h.type_version,
            credentialType: h.credential_type,
            tool: h.n8n_type.split('.').pop(),
          };
        }
      }

      if (resolved.n8nType) {
        const nodeDef = getNodeByName(catalog, resolved.n8nType);
        if (nodeDef && (!resolved.parameters || !Object.keys(resolved.parameters).length)) {
          resolved = {
            ...resolved,
            parameters: buildInitialParameters(nodeDef.properties || []),
          };
        }
      }
      return resolved;
    });

    const mergedSteps = mergeStepsFromEdit(workflow.steps, mapped);
    const prevEdges = resolveWorkflowEdges(workflow.steps, workflow.edges);
    const topologyUnchanged = hasSameStepIds(workflow.steps, mergedSteps);
    const mergedEdges = mergeEdgesFromEdit(
      prevEdges,
      topologyUnchanged ? undefined : parsed.edges,
      mergedSteps,
    );

    const wired = withTriggerFirst(mergedSteps, mergedEdges);
    const configs = stepConfigs ?? {};
    const { steps: setupSteps, stepConfigUpdates: autoConfigs } = await enrichStepsWithSetup(
      workflow,
      wired.steps,
      configs,
    );

    const llmConfigs = parsed.step_configs ?? {};
    const mergedConfigUpdates: Record<string, Partial<StepConfig>> = { ...autoConfigs };
    for (const [id, cfg] of Object.entries(llmConfigs)) {
      mergedConfigUpdates[id] = {
        ...mergedConfigUpdates[id],
        configType: 'n8n',
        ...cfg,
        parameters: { ...mergedConfigUpdates[id]?.parameters, ...cfg.parameters },
      };
    }

    const guides = buildSetupGuides(workflow, {
      ...configs,
      ...Object.fromEntries(
        Object.entries(mergedConfigUpdates).map(([id, c]) => [id, { configType: 'n8n' as const, ...c }]),
      ),
    });
    const coachMsg = formatCoachMessage(
      workflow,
      guides,
      parsed.message || 'Workflow aktualisiert.',
    );

    return {
      steps: setupSteps,
      edges: wired.edges,
      message: coachMsg,
      changed: true,
      stepConfigUpdates: Object.keys(mergedConfigUpdates).length ? mergedConfigUpdates : undefined,
      openStepId: nextOpenStepId(guides),
    };
  } catch (e) {
    console.error('[workflow-editor] LLM failed:', e);
    return null;
  }
}

export async function runWorkflowEditor(
  input: WorkflowEditInput,
  complete?: CompleteJson,
): Promise<WorkflowEditResult> {
  const msg = input.message.toLowerCase();
  const isSwapOrEdit = /(ändere|wechsle|tausche|ersetze|soll|schritt\s*\d+)/.test(msg);
  const configs = input.stepConfigs ?? {};

  // Struktur-Änderungen (IF/Switch/Merge/Löschen/Swap): Heuristik zuerst.
  const heuristic = await applyHeuristicEdit(input.workflow, input.message, configs);
  if (heuristic?.changed) return heuristic;

  // Node-Tausch & komplexe Edits: LLM mit voller Übersicht.
  if (complete && (isSwapOrEdit || !heuristic)) {
    const llm = await applyLlmEdit(
      input.workflow,
      input.message,
      complete,
      configs,
      input.coachContext,
    );
    if (llm?.changed) return llm;
  }

  if (heuristic) return heuristic;

  // Setup-/Konfig-Fragen (Webhook, Credentials, nächster Schritt)
  if (isCoachingIntent(input.message)) {
    return applyCoachingOnly(input.workflow, input.message, configs);
  }

  const guides = buildSetupGuides(input.workflow, configs);
  return {
    steps: input.workflow.steps,
    edges: resolveWorkflowEdges(input.workflow.steps, input.workflow.edges),
    message: formatCoachMessage(
      input.workflow,
      guides,
      'Konnte die Anfrage nicht umsetzen — bitte konkreter formulieren (z.B. „Schritt 2 soll OpenAI nutzen“, „Webhook einrichten“ oder „IF nach Schritt 3“).',
    ),
    changed: false,
    openStepId: nextOpenStepId(guides),
  };
}

