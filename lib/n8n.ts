/**
 * n8n REST API client — server-only.
 * Set MOCK_N8N=true in .env.local to skip real n8n calls during development.
 */

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
  await n8nFetch(`/workflows/${n8nId}`, { method: 'PATCH', body: JSON.stringify(workflowJson) });
}

export async function activateN8nWorkflow(n8nId: string): Promise<void> {
  if (MOCK()) return;
  await n8nFetch(`/workflows/${n8nId}/activate`, { method: 'POST' });
}

export async function deactivateN8nWorkflow(n8nId: string): Promise<void> {
  if (MOCK()) return;
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

export async function triggerTestExecution(n8nWorkflowId: string): Promise<{ executionId: string }> {
  if (MOCK()) return { executionId: `mock_exec_${Date.now()}` };
  // n8n doesn't have a direct "test run" endpoint in v1 — use webhook or manual trigger
  return n8nFetch(`/workflows/${n8nWorkflowId}/run`, { method: 'POST', body: JSON.stringify({}) });
}
