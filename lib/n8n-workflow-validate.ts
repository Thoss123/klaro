/**
 * Workflow-Validierung vor Deploy — Struktur lokal + optional n8n MCP get_node_types.
 */

import { aiSlotsFor, subNodeCount } from './ai-subnodes';
import { isN8nMcpConfigured, mcpGetNodeTypes, mcpPrepareTestPinData } from './n8n-mcp-bridge';
import { getN8nCatalog, getNodeByName } from './n8n-catalog';
import { buildInitialParameters, missingCrucialParams } from './n8n-parameter-utils';
import { requiresConfig, isConfigured } from './workflow-deploy';
import type { N8nCatalogSnapshot } from './n8n-catalog-types';
import type { StepConfig, Workflow, WorkflowStep } from './types';

export interface WorkflowValidationIssue {
  code: string;
  message: string;
  stepId?: string;
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: WorkflowValidationIssue[];
  warnings: WorkflowValidationIssue[];
}

const TRIGGER_TYPES = /Trigger$|\.webhook$|\.mcpTrigger$/;

function isTriggerStep(step: WorkflowStep): boolean {
  return step.type === 'trigger' || !!(step.n8nType && TRIGGER_TYPES.test(step.n8nType));
}

export function validateWorkflowStructure(
  workflow: Workflow,
  stepConfigs: Record<string, StepConfig> = {},
): WorkflowValidationResult {
  const errors: WorkflowValidationIssue[] = [];
  const warnings: WorkflowValidationIssue[] = [];
  const steps = workflow.steps ?? [];

  if (steps.length === 0) {
    errors.push({ code: 'empty', message: 'Der Workflow hat keine Schritte.' });
    return { valid: false, errors, warnings };
  }

  // Roh-Graph prüfen — withTriggerFirst würde sonst still einen Manual-Trigger einfügen.
  const ordered = steps;

  if (!isTriggerStep(ordered[0])) {
    errors.push({
      code: 'no_trigger',
      message: 'Schritt 1 muss ein Trigger sein (Webhook, Schedule oder Manual Trigger).',
      stepId: ordered[0]?.id,
    });
  }

  for (let i = 1; i < ordered.length; i++) {
    const step = ordered[i];
    if (isTriggerStep(step) && !step.subNodeOf) {
      errors.push({
        code: 'trigger_mid_flow',
        message: `„${step.label}" ist ein Trigger, darf aber nicht nach Schritt 1 stehen.`,
        stepId: step.id,
      });
    }
  }

  for (const step of steps) {
    if (!requiresConfig(step)) continue;

    const n8nType = stepConfigs[step.id]?.n8nType || step.n8nType;
    if (!n8nType) {
      errors.push({
        code: 'missing_n8n_type',
        message: `„${step.label}" hat keinen n8n-Node zugeordnet.`,
        stepId: step.id,
      });
      continue;
    }

    if (!isConfigured(step, stepConfigs[step.id])) {
      warnings.push({
        code: 'incomplete_config',
        message: `„${step.label}" ist noch nicht vollständig konfiguriert.`,
        stepId: step.id,
      });
    }

    for (const slot of aiSlotsFor(n8nType)) {
      if (slot.required && subNodeCount(step, slot.slot) === 0) {
        errors.push({
          code: 'missing_ai_slot',
          message: `„${step.label}" braucht ${slot.label}.`,
          stepId: step.id,
        });
      }
    }
  }

  const stepIds = new Set(steps.map(s => s.id));
  for (const edge of workflow.edges ?? []) {
    if (!stepIds.has(edge.source) || !stepIds.has(edge.target)) {
      warnings.push({
        code: 'dangling_edge',
        message: 'Eine Verbindung verweist auf einen gelöschten Schritt.',
      });
      break;
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Schema-basierte Checks gegen den Katalog: Node existiert + alle KRITISCHEN
 * Pflichtfelder gefüllt. resourceLocator-Felder (Airtable Base/Table, Sheets-Dokument,
 * Slack-Channel …) sind harte Fehler — sie müssen aus dem Tool gewählt werden.
 */
function catalogIssues(
  workflow: Workflow,
  stepConfigs: Record<string, StepConfig>,
  catalog: N8nCatalogSnapshot,
): { issues: WorkflowValidationResult; nodeIds: Set<string> } {
  const errors: WorkflowValidationIssue[] = [];
  const warnings: WorkflowValidationIssue[] = [];
  const nodeIds = new Set<string>();

  for (const step of workflow.steps) {
    const n8nType = stepConfigs[step.id]?.n8nType || step.n8nType;
    if (!n8nType) continue;
    nodeIds.add(n8nType);

    const node = getNodeByName(catalog, n8nType);
    if (!node) {
      warnings.push({
        code: 'catalog_miss',
        message: `„${step.label}": ${n8nType} nicht im lokalen Katalog — MCP prüft live.`,
        stepId: step.id,
      });
      continue;
    }

    if (step.subNodeOf) continue; // Sub-Node-Parameter prüft der Parent-Kontext.

    const values = {
      ...buildInitialParameters(node.properties || []),
      ...(step.parameters ?? {}),
      ...(stepConfigs[step.id]?.parameters ?? {}),
    };
    for (const prop of missingCrucialParams(node.properties || [], values)) {
      const isResource = prop.type === 'resourceLocator';
      const issue: WorkflowValidationIssue = {
        code: isResource ? 'missing_resource' : 'missing_required',
        message: isResource
          ? `„${step.label}": Pflichtfeld „${prop.displayName || prop.name}" muss aus dem Tool gewählt werden (z. B. Base/Tabelle).`
          : `„${step.label}": Pflichtfeld „${prop.displayName || prop.name}" fehlt.`,
        stepId: step.id,
      };
      // resourceLocator blockiert (kann nicht erraten werden); andere required-Felder = Warnung
      // (werden oft per Expression aus Vorschritten gefüllt).
      if (isResource) errors.push(issue);
      else warnings.push(issue);
    }
  }

  return { issues: { valid: errors.length === 0, errors, warnings }, nodeIds };
}

/** Katalog + MCP get_node_types — prüft ob Nodes auf der Instanz bekannt sind. */
export async function validateWorkflowWithMcp(
  workflow: Workflow,
  stepConfigs: Record<string, StepConfig> = {},
  n8nWorkflowId?: string,
): Promise<WorkflowValidationResult> {
  const base = validateWorkflowStructure(workflow, stepConfigs);
  const catalog = await getN8nCatalog();
  const cat = catalogIssues(workflow, stepConfigs, catalog);
  const errors = [...base.errors, ...cat.issues.errors];
  const warnings = [...base.warnings, ...cat.issues.warnings];
  const nodeIds = cat.nodeIds;

  if (isN8nMcpConfigured() && nodeIds.size > 0) {
    try {
      await mcpGetNodeTypes([...nodeIds].map(id => ({ nodeId: id })));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'MCP Node-Prüfung fehlgeschlagen';
      warnings.push({ code: 'mcp_node_types', message: msg });
    }
  }

  if (isN8nMcpConfigured() && n8nWorkflowId) {
    try {
      await mcpPrepareTestPinData(n8nWorkflowId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'MCP Test-Vorbereitung fehlgeschlagen';
      warnings.push({ code: 'mcp_pin_prep', message: msg });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export async function validateWorkflowForDeploy(
  workflow: Workflow,
  stepConfigs: Record<string, StepConfig> = {},
  n8nWorkflowId?: string,
): Promise<WorkflowValidationResult> {
  if (isN8nMcpConfigured()) {
    return validateWorkflowWithMcp(workflow, stepConfigs, n8nWorkflowId);
  }
  // Ohne MCP trotzdem schema-basiert prüfen (Node existiert + Pflichtfelder gefüllt).
  const base = validateWorkflowStructure(workflow, stepConfigs);
  const catalog = await getN8nCatalog();
  const cat = catalogIssues(workflow, stepConfigs, catalog);
  const errors = [...base.errors, ...cat.issues.errors];
  const warnings = [...base.warnings, ...cat.issues.warnings];
  return { valid: errors.length === 0, errors, warnings };
}
