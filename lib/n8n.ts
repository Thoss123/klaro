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

async function n8nFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
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
  return res.json().catch(() => null) as Promise<T>;
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
  data: Record<string, unknown>; // plaintext values (per Credential-Schema) — never stored here
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

/**
 * Autoritatives Credential-Schema direkt von der n8n-Instanz
 * (GET /credentials/schema/{type}) — exakt das Schema, gegen das n8n beim Anlegen validiert.
 * Liefert ein JSON-Schema { properties, required }. Null wenn nicht abrufbar.
 */
export async function getN8nCredentialSchema(type: string): Promise<{
  properties?: Record<string, { type?: string; default?: unknown; enum?: unknown[] }>;
  required?: string[];
  allOf?: Array<{ if?: { properties?: Record<string, { enum?: unknown[] }> } }>;
} | null> {
  if (MOCK() || !type) return null;
  try {
    return await n8nFetch(`/credentials/schema/${encodeURIComponent(type)}`);
  } catch (e) {
    console.warn('[n8n] credential schema fetch failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

// ── Workflows ─────────────────────────────────────────────────────────────────

export async function createN8nWorkflow(workflowJson: object): Promise<{ id: string }> {
  if (MOCK()) return { id: `mock_wf_${Date.now()}` };
  return n8nFetch('/workflows', { method: 'POST', body: JSON.stringify(workflowJson) });
}

/**
 * Stellt sicher, dass ein Workflow für MCP freigegeben ist (settings.availableInMCP).
 * Nötig, weil n8n MCP-Zugriff pro Workflow verlangt — sonst „Workflow is not available in MCP".
 * Heilt auch Workflows, die VOR dem Fix ohne Flag deployt wurden.
 */
export async function ensureWorkflowMcpEnabled(n8nId: string): Promise<void> {
  if (MOCK() || !n8nId) return;
  try {
    const wf = await n8nFetch<{
      name?: string;
      nodes?: unknown;
      connections?: unknown;
      settings?: { availableInMCP?: boolean; executionOrder?: string };
    }>(`/workflows/${n8nId}`);
    if (wf?.settings?.availableInMCP === true) return;
    // Nur schreibbare Felder zurückgeben (active/id/createdAt sind read-only → 400).
    await n8nFetch(`/workflows/${n8nId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: wf.name,
        nodes: wf.nodes,
        connections: wf.connections,
        settings: { ...(wf.settings ?? {}), executionOrder: wf.settings?.executionOrder ?? 'v1', availableInMCP: true },
      }),
    });
  } catch (e) {
    console.warn('[n8n] ensureWorkflowMcpEnabled failed:', e instanceof Error ? e.message : e);
  }
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

/**
 * Speichert die Workflow-Definition, OHNE zu publishen (kein availableInMCP → keine
 * Credential-Publish-Validierung). Nötig, um einen Workflow anzulegen/zu aktualisieren,
 * bevor der User seine Credentials (z.B. Postfach) verbunden hat.
 */
export async function saveN8nWorkflowDefinition(n8nId: string, workflowJson: object): Promise<void> {
  if (MOCK()) return;
  await n8nFetch(`/workflows/${n8nId}`, { method: 'PUT', body: JSON.stringify(workflowJson) });
}

export async function activateN8nWorkflow(n8nId: string): Promise<void> {
  if (MOCK()) return;

  if (isN8nMcpConfigured()) {
    await ensureWorkflowMcpEnabled(n8nId);
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
  data?: unknown;
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
  const res = await n8nFetch<{ data?: N8nExecution[] }>(`/executions?workflowId=${n8nWorkflowId}&limit=10`);
  return res?.data || [];
}

export interface N8nTestExecutionResult {
  executionId: string;
  status?: string;
  error?: string;
  via?: 'mcp' | 'rest';
}

/** Per-Node Lauf-Daten einer Execution (für n8n-artige Schritt-Ansicht). */
export interface N8nNodeRun {
  node: string;
  status: 'success' | 'error';
  error?: string;
  json: unknown[];        // Output-Items (json)
  itemCount: number;
}

export interface N8nExecutionDetail {
  id: string;
  status: string;
  finished: boolean;
  runData: N8nNodeRun[];
  error?: string;
}

/** Holt eine Execution inkl. runData (Input/Output je Node) — wie n8n NDV. */
export async function getExecutionDetail(executionId: string): Promise<N8nExecutionDetail | null> {
  if (!executionId) return null;
  if (MOCK()) {
    return { id: executionId, status: 'success', finished: true, runData: [] };
  }
  interface N8nRunEntry {
    error?: { message?: string };
    data?: { main?: Array<Array<{ json?: unknown }>> };
  }
  interface N8nExecutionResponse {
    id?: string;
    status?: string;
    finished?: boolean;
    data?: {
      resultData?: {
        runData?: Record<string, N8nRunEntry[]>;
        error?: { message?: string };
      };
    };
  }
  let res: N8nExecutionResponse | null = null;
  try {
    res = await n8nFetch<N8nExecutionResponse>(`/executions/${executionId}?includeData=true`);
  } catch {
    return null;
  }
  const runDataRaw = res?.data?.resultData?.runData;
  const runData: N8nNodeRun[] = [];
  if (runDataRaw) {
    for (const [node, runs] of Object.entries(runDataRaw)) {
      const run = runs?.[runs.length - 1];
      const out = run?.data?.main?.[0] as Array<{ json?: unknown }> | undefined;
      runData.push({
        node,
        status: run?.error ? 'error' : 'success',
        error: run?.error?.message,
        json: (out || []).map(o => o?.json ?? o),
        itemCount: out?.length ?? 0,
      });
    }
  }
  return {
    id: res?.id ?? executionId,
    status: res?.status ?? (res?.finished ? 'success' : 'unknown'),
    finished: !!res?.finished,
    runData,
    error: res?.data?.resultData?.error?.message,
  };
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
  const rest = await n8nFetch<{ executionId?: string; id?: string }>(`/workflows/${n8nWorkflowId}/run`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return {
    executionId: rest?.executionId ?? rest?.id ?? '',
    via: 'rest',
  };
}
