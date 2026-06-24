/**
 * Workflow Editor Agent — interprets chat requests and returns step/edge changes.
 */

import type { StepConfig, Workflow, WorkflowEdge, WorkflowStep } from '@/lib/types';
import {
  buildSetupGuides,
  enrichStepsWithSetup,
  formatCoachMessage,
  isCoachingIntent,
} from '@/lib/workflow-setup-coach';
import { attachSubNode, defaultEntryForSlot, aiSlotsFor, isSubNodeOnlyType } from '@/lib/ai-subnodes';
import { formatNodeMapForPrompt, swapTargets } from '@/lib/node-map';
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

/** Bekannte Ziel-Nodes für „Schritt N → X" / „ändere … zu X" — aus der Node-Map generiert. */
const SWAP_TARGETS: [RegExp, string][] = swapTargets();

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
  /** Pro Schritt: verfügbare Eingangsdaten-Felder (Output des Vorschritts) für Expressions. */
  inputSchema?: Record<string, { path: string; sample: string }[]>;
  /** Fehler je Node aus dem letzten Testlauf (für „was war der Error?" + Auto-Fix). */
  nodeErrors?: { node: string; error: string }[];
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

        if (!s.subNodeOf && isSubNodeOnlyType(mistralType)) {
          const agentDef = getNodeByName(catalog, '@n8n/n8n-nodes-langchain.agent');
          steps[i] = {
            ...s,
            n8nType: '@n8n/n8n-nodes-langchain.agent',
            n8nTypeVersion: agentDef ? (Array.isArray(agentDef.version) ? agentDef.version.at(-1) : agentDef.version) ?? 1 : 1,
            tool: 'agent',
            type: 'ai',
            parameters: {},
            credentialType: undefined,
          };
          const attached = attachSubNode(steps, edges, s.id, 'ai_languageModel', {
            name: mistralType,
            displayName: mistralDef?.displayName ?? 'Mistral',
            description: mistralDef?.description,
            version: mistralDef ? (Array.isArray(mistralDef.version) ? mistralDef.version.at(-1) : mistralDef.version) ?? 1 : 1,
            groups: [],
            categories: [],
            aliases: [],
            hasCredentials: !!mistralDef?.credentials?.[0]?.name,
            credentialTypes: [mistralDef?.credentials?.[0]?.name ?? ''],
            iconPath: null,
            axantiloCategory: 'ai',
          });
          steps = attached.steps;
          edges = attached.edges;
        } else {
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
        }
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
      if (!steps[index].subNodeOf && isSubNodeOnlyType(n8nType)) {
        const catalog = await getN8nCatalog();
        const agentDef = getNodeByName(catalog, '@n8n/n8n-nodes-langchain.agent');
        
        steps[index] = {
          ...steps[index],
          n8nType: '@n8n/n8n-nodes-langchain.agent',
          n8nTypeVersion: agentDef ? (Array.isArray(agentDef.version) ? agentDef.version.at(-1) : agentDef.version) ?? 1 : 1,
          tool: 'agent',
          type: 'ai',
          parameters: {},
          credentialType: undefined,
        };
        changed = true;
        reply = `Schritt ${stepNumber(steps, steps[index].id)}: als Agent eingerichtet.`;
        
        let slot = 'ai_languageModel';
        if (n8nType.toLowerCase().includes('tool') || n8nType.toLowerCase().includes('store')) slot = 'ai_tool';
        else if (n8nType.toLowerCase().includes('memory')) slot = 'ai_memory';
        
        const entry = index_.find(e => e.name === n8nType);
        if (entry) {
          const attached = attachSubNode(steps, edges, steps[index].id, slot, entry);
          steps = attached.steps;
          edges = attached.edges;
          reply += ` ${entry.displayName ?? n8nType.split('.').pop()} wurde verbunden.`;
        }
      } else {
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
  };
}

function formatInputSchemaForPrompt(
  steps: WorkflowStep[],
  inputSchema?: Record<string, { path: string; sample: string }[]>,
): string {
  if (!inputSchema) return '';
  const lines: string[] = [];
  steps.forEach((s, i) => {
    const fields = inputSchema[s.id];
    if (fields?.length) {
      lines.push(`Schritt ${i + 1} ("${s.label}") Eingangsfelder: ${fields.slice(0, 20).map(f => `$json.${f.path}`).join(', ')}`);
    }
  });
  return lines.length
    ? `\nVERFÜGBARE EINGANGSDATEN (aus letztem Testlauf — nutze sie als Expression \`={{ $json.feld }}\` in step_configs):\n${lines.join('\n')}`
    : '';
}

function formatNodeErrorsForPrompt(nodeErrors?: { node: string; error: string }[]): string {
  if (!nodeErrors?.length) return '';
  return `\nFEHLER AUS LETZTEM TESTLAUF (wenn der User nach dem Error fragt: erkläre ihn knapp auf Deutsch UND korrigiere die betroffenen step_configs/parameters automatisch):\n${nodeErrors.map(e => `- Node "${e.node}": ${e.error}`).join('\n')}`;
}

async function applyLlmEdit(
  workflow: Workflow,
  message: string,
  complete: CompleteJson,
  stepConfigs?: Record<string, StepConfig>,
  coachContext?: WorkflowEditorCoachContext,
  inputSchema?: Record<string, { path: string; sample: string }[]>,
  nodeErrors?: { node: string; error: string }[],
): Promise<WorkflowEditResult | null> {
  const index = await getCatalogIndex();
  const overview = await buildWorkflowOverview(workflow);
  const keywords = `${message} ${workflow.title} ${workflow.steps.map(s => s.label).join(' ')}`;
  const candidates = searchCatalogIndex(index, keywords, 40);

  const contextBlock = formatCoachContextBlock(coachContext);

  const system = `Du bist Axantilo im Workflow-Editor — der technische Setup-Coach für n8n Workflows.
Nutze den AXANTILO-KONTEXT, um die Anfragen perfekt umzusetzen. Der User beschreibt Änderungen am Workflow (Nodes hinzufügen, umbauen, tauschen oder löschen).
Antworte IMMER UND AUSSCHLIESSLICH mit JSON in folgendem Format:
{
  "message": "Kurze, freundliche Bestätigung auf Deutsch + Erklärung was als Nächstes zu tun ist.",
  "steps": [{"id":"...","label":"...","type":"trigger|action|ai|decision|human|output","n8nType":"...","n8nTypeVersion":1,"note":"Kurzer Zweck auf Deutsch","parameters":{}}],
  "edges": [{"id":"e-a-b","source":"step-id-a","target":"step-id-b","branch":"default|true|false|switch-0","targetInput":0,"connectionType":"ai_languageModel"}],
  "step_configs": {"step-id": {"parameters": {"...":"..."}}}
}
STRIKTE REGELN FÜR DEINE ARBEIT:
1. LÖSCHEN VON NODES: Wenn der User verlangt, dass bestimmte Schritte "weg" sollen oder gelöscht werden sollen, MUSST du diese Knoten (und all ihre Sub-Nodes) komplett aus dem "steps" Array weglassen! WICHTIG: Wenn du Knoten löschst oder hinzufügst (z.B. ein IF einfügst), musst du ZWINGEND das komplette "edges" Array mitsenden und die Verbindungen so anpassen, dass der Graph sauber verbunden ist (ohne die gelöschten Knoten).
2. EDGES BEI UPDATES: Wenn du NUR Parameter oder den Typ eines bestehenden Knotens änderst (z.B. Slack zu Teams) und keine Knoten löschst/hinzufügst, lass "edges" komplett leer ([]).
3. KORREKTE NODE-TYPEN (n8nType): Erfinde NIEMALS Nodes. Nutze NUR die exakten n8nTypes aus der Kandidatenliste ganz unten!
4. KI-MODELLE & TOOLS SIND IMMER SUB-NODES: Ein Sprachmodell (wie Mistral Cloud Chat, OpenAI) oder ein Tool darf NIEMALS ein normaler Knoten im Workflow-Ablauf (Flow) sein!
   - FALSCH: Ein Schritt mit n8nType="@n8n/n8n-nodes-langchain.lmChatMistralCloud" der ganz normal zwischen zwei Schritten hängt. Das zerschießt alles!
   - RICHTIG: Setze einen "AI Agent" (@n8n/n8n-nodes-langchain.agent) in den Hauptflow. Hänge dann das Sprachmodell als Sub-Node daran an.
   - SO GEHT'S: Das Modell kommt auch als Element in "steps", ABER mit dem speziellen Feld "subNodeOf": {"parentId": "id-des-agenten", "slot": "ai_languageModel"}. Zusätzlich musst du eine Edge von dem Modell zum Agenten setzen mit "connectionType": "ai_languageModel" (bzw. "ai_tool", "ai_memory").
5. DATENFLUSS & EXPRESSIONS: Felder, die dynamische Daten aus Vorschritten brauchen (Texte, Emails), MÜSSEN n8n-Expressions mit vorangestelltem '=' verwenden (z.B. "={{ $json.body }}"). Nutze dafür die "VERFÜGBARE EINGANGSDATEN".
6. VERHALTEN & MESSAGE: Du redest direkt mit dem User auf Deutsch. Nenne die betroffenen Schritte. Erkläre bei Fehlern die Ursache und wie du es behoben hast. Wenn er dich bittet, Mistral Large zu nehmen, setze bei den Parametern des Mistral-Sub-Nodes einfach "model": "mistral-large-latest". Bei "Code" Nodes MUSS der Code in den Parameter "jsCode" gesetzt werden. Bei "If" Nodes nutze "conditions". Sei smart, gib nicht auf, löse das Problem!
7. EDGES LÖSCHEN/HINZUFÜGEN: Wenn du die Edges (Verbindungen) änderst, ersetze das "edges" Array komplett mit dem neuen Graphen. Schritt 1 MUSS immer ein Trigger (z.B. n8n-nodes-base.manualTrigger) sein.
8. NODE-MAP BEACHTEN: Unten bekommst du eine NODE-MAP mit Grundregeln, Bau-Patterns und Verdrahtungs-Hinweisen zu den relevanten Nodes. Halte dich exakt daran (Sub-Node-Slots, branch/targetInput, typische Operationen, Credential-Hinweise). Bei Google-Diensten: Der User verbindet sein Konto in 3 Klicks über Axantilos zentrale OAuth-App — leite NIEMALS an, eigene OAuth-Clients oder API-Token in der Google Cloud Console anzulegen.
9. TESTLAUF-ANALYSE (Daten fließen?): Wenn im Kontext „Letzter Testlauf — Status & Output je Schritt" steht, analysiere den Datenfluss von vorn nach hinten und sag dem User in der message konkret, ob die Daten richtig durchlaufen:
   - Kam an JEDEM Schritt etwas an und wurde sinnvoll weitergegeben?
   - Benenne leere Outputs („Schritt X liefert nichts — daher bekommt der nächste Schritt keine Daten"), fehlende/falsche Felder (erwartetes Feld fehlt im Output) und gescheiterte Schritte (Status FEHLER) — jeweils mit dem konkreten Schritt-Namen.
   - Behebe die Ursache wenn möglich direkt (step_configs/parameters/Expressions auf "={{ $json.feld }}" anpassen, fehlende Zugänge/Felder benennen). Sei nicht vage.
   - Empfiehl das Live-Schalten ERST, wenn der Test sauber durchläuft (alle Schritte ok, Daten fließen bis zum Schluss). Liegt kein Testlauf vor, erfinde keine Daten — sag, dass zuerst getestet werden sollte.`;

  const user = `Workflow: ${workflow.title}

ÜBERSICHT (Schritt-Nummer = „Schritt N" in User-Anfragen):
${formatOverviewForPrompt(overview)}

Alle Schritte inkl. Sub-Nodes (JSON):
${JSON.stringify(flattenStepsForEditor(workflow.steps), null, 2)}

Aktuelle Edges:
${JSON.stringify(workflow.edges ?? [], null, 2)}

User-Anfrage: ${message}
${contextBlock}${formatInputSchemaForPrompt(workflow.steps, inputSchema)}${formatNodeErrorsForPrompt(nodeErrors)}
${formatNodeMapForPrompt([
    ...workflow.steps.map(s => s.n8nType).filter((t): t is string => !!t),
    ...candidates.slice(0, 35).map(c => c.name),
  ])}

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
    // Q&A / Erklärung ohne Struktur-Änderung: trotzdem die Antwort zeigen (z.B. „was hast du
    // umgestellt?", „was war der Error?"). Nur step_configs (Parameter) können sich ändern.
    if (!parsed?.steps?.length) {
      if (parsed?.message?.trim()) {
        return {
          steps: workflow.steps,
          edges: resolveWorkflowEdges(workflow.steps, workflow.edges),
          message: parsed.message.trim(),
          stepConfigUpdates: parsed.step_configs,
          changed: !!(parsed.step_configs && Object.keys(parsed.step_configs).length),
        };
      }
      return null;
    }

    const extraSubNodes: WorkflowStep[] = [];
    const extraEdges: WorkflowEdge[] = [];

    const catalog = await getN8nCatalog();
    const mapped = parsed.steps.map(s => {
      const prev = workflow.steps.find(p => p.id === s.id);
      // Position, note, vorhandene Felder bewahren; LLM-Felder (label/type/n8nType) gewinnen.
      let resolved: WorkflowStep = { ...prev, ...s, position: prev?.position, note: s.note ?? prev?.note };

      if (resolved.n8nType && !getNodeByName(catalog, resolved.n8nType)) {
        console.warn(`[workflow-editor] LLM halluziniert Node: ${resolved.n8nType} — nutze Heuristik-Fallback.`);
        resolved = { ...resolved, n8nType: undefined };
      }

      // Sub-Node-only (Mistral/Anthropic Chat Model, Memory, Tool) NICHT als Haupt-Node verwenden —
      // die funktionieren nur an einem Agent/Basic LLM Chain. Auf Standalone-KI-Node zurückfallen.
      if (resolved.n8nType && !resolved.subNodeOf && isSubNodeOnlyType(resolved.n8nType)) {
        console.warn(`[workflow-editor] "${resolved.n8nType}" ist nur als Sub-Node nutzbar → Wandle in Agent + Sub-Node um.`);
        const requestedType = resolved.n8nType;
        const requestedParams = resolved.parameters;
        const requestedVersion = resolved.n8nTypeVersion;
        
        resolved = {
          ...resolved,
          n8nType: '@n8n/n8n-nodes-langchain.agent',
          type: 'ai',
          tool: 'agent',
          parameters: {},
          credentialType: undefined,
        };
        
        let slot = 'ai_languageModel';
        if (requestedType.toLowerCase().includes('tool') || requestedType.toLowerCase().includes('store')) slot = 'ai_tool';
        else if (requestedType.toLowerCase().includes('memory')) slot = 'ai_memory';

        const subId = `sub-${slot}-${Date.now()}-${Math.random().toString(36).substring(2,7)}`;
        extraSubNodes.push({
          id: subId,
          label: requestedType.split('.').pop()!,
          type: 'ai',
          n8nType: requestedType,
          n8nTypeVersion: requestedVersion ?? 1,
          tool: requestedType.split('.').pop()!,
          subNodeOf: { parentId: resolved.id, slot },
          parameters: requestedParams,
        });
        
        extraEdges.push({
          id: `e-ai-${subId}-${resolved.id}-${slot}`,
          source: subId,
          target: resolved.id,
          connectionType: slot,
        });
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
    mergedSteps.push(...extraSubNodes);
    
    const prevEdges = resolveWorkflowEdges(workflow.steps, workflow.edges);
    const topologyUnchanged = hasSameStepIds(workflow.steps, mergedSteps.filter(s => !extraSubNodes.find(e => e.id === s.id)));
    const edgesFromLlm = topologyUnchanged ? undefined : parsed.edges;
    if (edgesFromLlm) edgesFromLlm.push(...extraEdges);
    
    const mergedEdges = mergeEdgesFromEdit(
      prevEdges,
      edgesFromLlm,
      mergedSteps,
    );
    if (!edgesFromLlm && extraEdges.length > 0) mergedEdges.push(...extraEdges);

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
      input.inputSchema,
      input.nodeErrors,
    );
    if (llm) return llm;
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
  };
}
