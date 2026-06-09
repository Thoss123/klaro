/**
 * Synchronisiert Klaro-Workflow-Änderungen mit n8n (REST + MCP partial update).
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
  buildN8nWorkflow,
  n8nNodeNameForStep,
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
    
    // 1. Update parameters
    const parameters = buildParameters(step, config);
    if (parameters && Object.keys(parameters).length > 0) {
      ops.push({
        operation: 'updateNodeParameters',
        nodeName,
        parameters,
      });
    }

    // Note: n8n MCP update_workflow does NOT support setNodeCredential.
    // Credentials must be updated via REST sync (structureChanged: true).
  });

  return ops;
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
}

/** Nach Editor-Chat oder Panel-Save: Graph per REST, Parameter per MCP. */
export async function syncDeployedWorkflow(input: SyncDeployedWorkflowInput): Promise<{
  restUpdated: boolean;
  mcpAppliedOperations: number;
}> {
  const mappings = input.credentialMappings ?? buildMappingsFromWorkflow(input.workflow, input.stepConfigs);

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
