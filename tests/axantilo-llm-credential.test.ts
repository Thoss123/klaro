/**
 * Tests für ensureAxantiloLlmCredential (lib/axantilo-llm-credential.ts) —
 * idempotente Pro-Projekt-Provisionierung der n8n-openAiApi-Credential, die auf
 * Axantilos gemeterten Mistral-Proxy zeigt.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const USER_ID = '99999999-8888-4777-8666-555555555555';
const PROJECT_ID = '11111111-2222-4333-8444-555555555555';

const createN8nCredentialMock = vi.fn(async (input: { name: string; type: string; data: Record<string, unknown> }) => ({
  id: 'n8n_cred_123',
  ...input,
}));

vi.mock('@/lib/n8n', () => ({
  createN8nCredential: (input: unknown) => createN8nCredentialMock(input as never),
}));

import { AXANTILO_AI_TOOL, ensureAxantiloLlmCredential, isAxantiloAiTool } from '@/lib/axantilo-llm-credential';

/** Minimaler chainbarer Supabase-Mock für user_credentials select + upsert. */
function makeSupabase(existing: { n8n_credential_id: string } | null) {
  const upsertCalls: unknown[] = [];
  const client = {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: existing }),
              }),
            }),
          }),
        }),
      }),
      upsert: (row: unknown) => {
        upsertCalls.push(row);
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as SupabaseClient;
  return { client, upsertCalls };
}

describe('isAxantiloAiTool', () => {
  it('matches the axantilo_ai marker exactly', () => {
    expect(isAxantiloAiTool(AXANTILO_AI_TOOL)).toBe(true);
    expect(isAxantiloAiTool('lmChatOpenAi')).toBe(false);
    expect(isAxantiloAiTool(undefined)).toBe(false);
    expect(isAxantiloAiTool(null)).toBe(false);
  });
});

describe('ensureAxantiloLlmCredential', () => {
  beforeEach(() => {
    process.env.WORKSPACE_API_TOKEN = 'wtoken';
    createN8nCredentialMock.mockClear();
  });
  afterEach(() => {
    delete process.env.WORKSPACE_API_TOKEN;
    delete process.env.MOCK_N8N;
  });

  it('returns the existing credential id without calling n8n again (idempotent)', async () => {
    const { client } = makeSupabase({ n8n_credential_id: 'existing_cred_1' });
    const id = await ensureAxantiloLlmCredential(client, USER_ID, PROJECT_ID, 'https://axantilo.com');
    expect(id).toBe('existing_cred_1');
    expect(createN8nCredentialMock).not.toHaveBeenCalled();
  });

  it('creates a new n8n openAiApi credential pointing at /api/agent/v1 with the composite key', async () => {
    const { client, upsertCalls } = makeSupabase(null);
    const id = await ensureAxantiloLlmCredential(client, USER_ID, PROJECT_ID, 'https://axantilo.com/');
    expect(id).toBe('n8n_cred_123');
    expect(createN8nCredentialMock).toHaveBeenCalledTimes(1);
    const call = createN8nCredentialMock.mock.calls[0][0] as { type: string; data: Record<string, unknown> };
    expect(call.type).toBe('openAiApi');
    expect(call.data.apiKey).toBe(`wtoken.${PROJECT_ID}`);
    expect(call.data.url).toBe('https://axantilo.com/api/agent/v1');
    // n8n Public-API lehnt openAiApi ohne diese Felder mit 400 ab (if/then-Schema-Quirk).
    expect(call.data.header).toBe(false);
    expect(call.data.allowedHttpRequestDomains).toBe('all');
    expect(upsertCalls).toHaveLength(1);
    const row = upsertCalls[0] as Record<string, unknown>;
    expect(row.tool_name).toBe(AXANTILO_AI_TOOL);
    expect(row.credential_type).toBe('api_key'); // CHECK-Constraint erlaubt nur api_key|oauth
    expect(row.n8n_credential_id).toBe('n8n_cred_123');
  });

  it('returns a mock credential id and skips the n8n call when MOCK_N8N=true', async () => {
    process.env.MOCK_N8N = 'true';
    const { client } = makeSupabase(null);
    const id = await ensureAxantiloLlmCredential(client, USER_ID, PROJECT_ID, 'https://axantilo.com');
    expect(id).toMatch(/^mock_cred_axantilo_ai_/);
    expect(createN8nCredentialMock).not.toHaveBeenCalled();
  });

  it('returns null when WORKSPACE_API_TOKEN is not configured', async () => {
    delete process.env.WORKSPACE_API_TOKEN;
    const { client } = makeSupabase(null);
    const id = await ensureAxantiloLlmCredential(client, USER_ID, PROJECT_ID, 'https://axantilo.com');
    expect(id).toBeNull();
    expect(createN8nCredentialMock).not.toHaveBeenCalled();
  });
});
