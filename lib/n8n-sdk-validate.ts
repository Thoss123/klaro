/**
 * MCP validate_workflow vor Deploy — SDK-Code aus n8n-JSON.
 */

import { isN8nMcpConfigured, mcpValidateWorkflow } from './n8n-mcp-bridge';
import { workflowJsonToSdkCode, type N8nWorkflowJsonForSdk } from './workflow-sdk-codegen';
import type { WorkflowValidationIssue } from './n8n-workflow-validate';

export interface SdkValidationResult {
  valid: boolean;
  errors: WorkflowValidationIssue[];
  warnings: WorkflowValidationIssue[];
  nodeCount?: number;
  skipped: boolean;
}

export async function validateWorkflowJsonWithSdk(
  workflowJson: N8nWorkflowJsonForSdk,
): Promise<SdkValidationResult> {
  if (!isN8nMcpConfigured()) {
    return { valid: true, errors: [], warnings: [], skipped: true };
  }

  const code = workflowJsonToSdkCode(workflowJson);

  try {
    const result = await mcpValidateWorkflow(code);
    const errors: WorkflowValidationIssue[] = (result.errors ?? []).map(msg => ({
      code: 'sdk_invalid',
      message: msg,
    }));
    const warnings: WorkflowValidationIssue[] = (result.warnings ?? []).map(w => ({
      code: w.code || 'sdk_warning',
      message: w.message,
      stepId: w.nodeName,
    }));

    return {
      valid: !!result.valid,
      errors,
      warnings,
      nodeCount: result.nodeCount,
      skipped: false,
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'SDK-Validierung fehlgeschlagen';
    return {
      valid: false,
      errors: [{ code: 'sdk_validate_error', message }],
      warnings: [],
      skipped: false,
    };
  }
}
