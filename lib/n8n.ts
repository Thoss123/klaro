/**
 * n8n REST API client — server-only.
 * Set MOCK_N8N=true in .env.local to skip real n8n calls during development.
 * Workflow tests prefer instance-level MCP when N8N_MCP_* is configured.
 */

import {
  isN8nMcpConfigured,
  mcpPublishWorkflow,
  mcpRunWorkflowTest,
  mcpUnpublishWorkflow,
} from '@/lib/n8n-mcp-bridge';

const BASE = () => process.env.N8N_API_URL || 'http://localhost:5678/api/v1';
const KEY  = () => process.env.N8N_API_KEY  || '';
const MOCK = () => process.env.MOCK_N8N === 'true';

async function n8nFetch(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': KEY(),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`n8n ${options.method || 'GET'} ${path} → ${res.status}: ${body}`);
  }
  return res.json().catch(() => null);
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function createN8nProject(name: string): Promise<{ id: string }> {
  if (MOCK()) return { id: `mock_project_${Date.now()}` };
  return n8nFetch('/projects', { method: 'POST', body: JSON.stringify({ name }) });
}

// ── Credentials ───────────────────────────────────────────────────────────────

export interface N8nCredentialInput {
  name: string;
  type: string;          // e.g. "gmailOAuth2Api", "openAiApi"
  data: Record<string, string>; // plaintext values — never stored here
  projectId?: string;
}

export async function createN8nCredential(input: N8nCredentialInput): Promise<{ id: string }> {
  if (MOCK()) return { id: `mock_cred_${Date.now()}` };
  return n8nFetch('/credentials', { method: 'POST', body: JSON.stringify(input) });
}

export async function deleteN8nCredential(credentialId: string): Promise<void> {
  if (MOCK()) return;
  await n8nFetch(`/credentials/${credentialId}`, { method: 'DELETE' });
}

// ── Workflows ─────────────────────────────────────────────────────────────────

export async function createN8nWorkflow(workflowJson: object): Promise<{ id: string }> {
  if (MOCK()) return { id: `mock_wf_${Date.now()}` };
  return n8nFetch('/workflows', { method: 'POST', body: JSON.stringify(workflowJson) });
}

export async function updateN8nWorkflow(n8nId: string, workflowJson: object): Promise<void> {
  if (MOCK()) return;
  const payload = {
    ...workflowJson,
    settings: {
      executionOrder: 'v1',
      ...((workflowJson as { settings?: Record<string, unknown> }).settings ?? {}),
      availableInMCP: true,
    },
  };
  await n8nFetch(`/workflows/${n8nId}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function activateN8nWorkflow(n8nId: string): Promise<void> {
  if (MOCK()) return;

  if (isN8nMcpConfigured()) {
    const result = await mcpPublishWorkflow(n8nId);
    if (!result.success) {
      throw new Error(result.error || 'n8n MCP publish_workflow fehlgeschlagen');
    }
    return;
  }

  await n8nFetch(`/workflows/${n8nId}/activate`, { method: 'POST' });
}

export async function deactivateN8nWorkflow(n8nId: string): Promise<void> {
  if (MOCK()) return;

  if (isN8nMcpConfigured()) {
    const result = await mcpUnpublishWorkflow(n8nId);
    if (!result.success) {
      throw new Error(result.error || 'n8n MCP unpublish_workflow fehlgeschlagen');
    }
    return;
  }

  await n8nFetch(`/workflows/${n8nId}/deactivate`, { method: 'POST' });
}

export async function deleteN8nWorkflow(n8nId: string): Promise<void> {
  if (MOCK()) return;
  await n8nFetch(`/workflows/${n8nId}`, { method: 'DELETE' });
}

// ── Executions ────────────────────────────────────────────────────────────────

export interface N8nExecution {
  id: string;
  status: 'success' | 'error' | 'running' | 'waiting';
  startedAt: string;
  stoppedAt?: string;
  data?: any;
}

export async function getExecutions(n8nWorkflowId: string): Promise<N8nExecution[]> {
  if (MOCK()) {
    return [{
      id: 'mock_exec_1',
      status: 'success',
      startedAt: new Date().toISOString(),
      stoppedAt: new Date().toISOString(),
    }];
  }
  const res = await n8nFetch(`/executions?workflowId=${n8nWorkflowId}&limit=10`);
  return res?.data || [];
}

export interface N8nTestExecutionResult {
  executionId: string;
  status?: string;
  error?: string;
  via?: 'mcp' | 'rest';
}

export async function triggerTestExecution(n8nWorkflowId: string): Promise<N8nTestExecutionResult> {
  if (MOCK()) return { executionId: `mock_exec_${Date.now()}`, status: 'success', via: 'mcp' };

  if (isN8nMcpConfigured()) {
    const result = await mcpRunWorkflowTest(n8nWorkflowId);
    return {
      executionId: result.executionId ?? '',
      status: result.status,
      error: result.error,
      via: 'mcp',
    };
  }

  // Fallback wenn MCP nicht konfiguriert (veralteter REST-Endpunkt)
  const rest = await n8nFetch(`/workflows/${n8nWorkflowId}/run`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return {
    executionId: rest?.executionId ?? rest?.id ?? '',
    via: 'rest',
  };
}
