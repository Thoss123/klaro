/**
 * Synchronisiert Axantilo-Workflow-Änderungen mit n8n (REST + MCP partial update).
 */

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { buildParameters } from './workflow-deploy';
import {
  isN8nMcpConfigured,
  mcpUpdateWorkflow,
  type McpWorkflowOperation,
} from './n8n-mcp-bridge';
import { updateN8nWorkflow } from './n8n';
import {
  alignAuthenticationParameter,
  buildN8nWorkflow,
  n8nNodeNameForStep,
  resolveCredentialKey,
  type StepMapping,
} from './workflow-generator';
import type { StepConfig, Workflow, WorkflowStep } from './types';

export function buildMcpParameterOperations(
  workflow: Workflow,
  stepConfigs: Record<string, StepConfig>,
  changedStepIds?: string[],
  mappings?: StepMapping[],
): McpWorkflowOperation[] {
  const ops: McpWorkflowOperation[] = [];
  const changed = changedStepIds ? new Set(changedStepIds) : null;

  workflow.steps.forEach((step, index) => {
    if (changed && !changed.has(step.id)) return;

    const config = stepConfigs[step.id];
    const nodeName = n8nNodeNameForStep(step.label, index);
    const mapping = mappings?.find(m => m.step_id === step.id);
    const credentialKey = resolveCredentialKey(mapping, step) || config?.credentialType;
    const credentialId = mapping?.credential_id;

    // 1. Parameter aktualisieren — "authentication" dabei mit dem Credential abgleichen,
    // sonst pusht der Sync gespeicherte Altwerte wie "none" zurück nach n8n und die
    // Ausführung scheitert mit „does not have any credentials of type none defined".
    const rawParameters = buildParameters(step, config);
    if (rawParameters && Object.keys(rawParameters).length > 0) {
      ops.push({
        operation: 'updateNodeParameters',
        nodeName,
        parameters: alignAuthenticationParameter(rawParameters, credentialKey, !!credentialId),
      });
    }

    // 2. Credential direkt am Node setzen — n8n MCP update_workflow unterstützt
    // setNodeCredential (live verifiziert). Vorher erreichten Credentials n8n nur
    // beim vollen REST-Push (structureChanged), Panel-Saves ließen den Node ohne.
    if (credentialKey && credentialId) {
      ops.push({
        operation: 'setNodeCredential',
        nodeName,
        credentialKey,
        credentialId,
        credentialName: `${credentialKey}-credential`,
      });
    }
  });

  return ops;
}

/**
 * Fehlende n8n-Credential-IDs aus user_credentials nachschlagen (per tool_name
 * oder credential_type). Editor-Chat & Co. rufen den Sync ohne aufgelöste
 * Mappings auf — ohne diesen Schritt kämen Nodes dort nie an ihr Credential.
 */
export async function resolveCredentialIdsForMappings(
  mappings: StepMapping[],
  userId: string,
  projectId?: string,
): Promise<StepMapping[]> {
  const unresolved = mappings.some(m => !m.credential_id && (m.tool || m.credential_type));
  if (!unresolved) return mappings;

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('user_credentials')
    .select('tool_name, n8n_credential_id')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (projectId) query = query.eq('project_id', projectId);
  const { data: creds } = await query;

  const credMap: Record<string, string> = {};
  for (const c of creds ?? []) {
    if (c.n8n_credential_id) credMap[c.tool_name] = c.n8n_credential_id;
  }

  return mappings.map(m => ({
    ...m,
    credential_id: m.credential_id
      || (m.tool && credMap[m.tool])
      || (m.credential_type && credMap[m.credential_type])
      || undefined,
  }));
}

export async function pushWorkflowJsonToN8n(
  n8nWorkflowId: string,
  workflow: Workflow,
  mappings: StepMapping[],
  workflowName: string,
): Promise<void> {
  const workflowJson = buildN8nWorkflow(workflow, mappings, workflowName);
  await updateN8nWorkflow(n8nWorkflowId, workflowJson);
}

export async function syncParametersToN8nMcp(
  n8nWorkflowId: string,
  workflow: Workflow,
  stepConfigs: Record<string, StepConfig>,
  changedStepIds?: string[],
  mappings?: StepMapping[],
): Promise<{ appliedOperations: number } | null> {
  if (!isN8nMcpConfigured()) return null;

  const operations = buildMcpParameterOperations(workflow, stepConfigs, changedStepIds, mappings);
  if (operations.length === 0) return { appliedOperations: 0 };

  const result = await mcpUpdateWorkflow(n8nWorkflowId, operations);
  return { appliedOperations: result.appliedOperations };
}

export async function resolveN8nWorkflowId(
  workflowDbId: string,
  userId: string,
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('workflows')
    .select('n8n_workflow_id')
    .eq('id', workflowDbId)
    .eq('user_id', userId)
    .maybeSingle();

  return data?.n8n_workflow_id ?? null;
}

export function buildMappingsFromWorkflow(
  workflow: Workflow,
  stepConfigs: Record<string, StepConfig>,
): StepMapping[] {
  return workflow.steps.map(step => {
    const config = stepConfigs[step.id];
    const n8nType = config?.n8nType || step.n8nType;
    const parameters = buildParameters(step, config);
    return {
      step_id: step.id,
      n8n_type: n8nType,
      type_version: config?.n8nTypeVersion ?? step.n8nTypeVersion,
      credential_type: config?.credentialType || step.credentialType,
      tool: n8nType?.split('.').pop(),
      ...(parameters ? { parameters } : {}),
    };
  });
}

export interface SyncDeployedWorkflowInput {
  n8nWorkflowId: string;
  workflow: Workflow;
  stepConfigs: Record<string, StepConfig>;
  workflowName: string;
  structureChanged?: boolean;
  changedStepIds?: string[];
  credentialMappings?: StepMapping[];
  /** Ohne credentialMappings: Credential-IDs für diesen User aus der DB auflösen. */
  userId?: string;
  projectId?: string;
}

/** Nach Editor-Chat oder Panel-Save: Graph per REST, Parameter + Credentials per MCP. */
export async function syncDeployedWorkflow(input: SyncDeployedWorkflowInput): Promise<{
  restUpdated: boolean;
  mcpAppliedOperations: number;
}> {
  let mappings = input.credentialMappings ?? buildMappingsFromWorkflow(input.workflow, input.stepConfigs);
  if (!input.credentialMappings && input.userId) {
    mappings = await resolveCredentialIdsForMappings(mappings, input.userId, input.projectId);
  }

  let restUpdated = false;
  if (input.structureChanged) {
    await pushWorkflowJsonToN8n(
      input.n8nWorkflowId,
      input.workflow,
      mappings,
      input.workflowName,
    );
    restUpdated = true;
  }

  const mcpResult = await syncParametersToN8nMcp(
    input.n8nWorkflowId,
    input.workflow,
    input.stepConfigs,
    input.changedStepIds,
    mappings,
  );

  return {
    restUpdated,
    mcpAppliedOperations: mcpResult?.appliedOperations ?? 0,
  };
}
