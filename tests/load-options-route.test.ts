/**
 * Integrationstest für POST /api/n8n/load-options — der „Choose from list"-Pfad:
 * credentialId aus dem Body lesen, Credential per n8n-ID ODER Supabase-UUID
 * finden, Token entschlüsseln und die Airtable-Optionen liefern.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { encrypt } from '@/lib/encryption';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const SUPABASE_ROW_ID = '7c1f2a3b-1111-4222-8333-944455566677';
const N8N_CRED_ID = 'vJ2xJ8sJ3kQ9aBc1';

const credRows = [{
  id: SUPABASE_ROW_ID,
  user_id: USER_ID,
  status: 'active',
  n8n_credential_id: N8N_CRED_ID,
  encrypted_value: encrypt('pat-airtable-secret'),
}];

/** Minimaler chainbarer Supabase-Mock: select/eq sammeln Filter, limit() liefert Treffer. */
function makeCredentialSupabase() {
  return {
    from: (_table: string) => {
      const filters: Array<[string, unknown]> = [];
      type Builder = {
        select: () => Builder;
        eq: (col: string, val: unknown) => Builder;
        limit: () => Promise<{ data: typeof credRows }>;
      };
      const builder: Builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => { filters.push([col, val]); return builder; },
        limit: async () => ({
          data: credRows.filter(r => filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v)),
        }),
      };
      return builder;
    },
  };
}

function makeAuthSupabase() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } } }) },
  };
}

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => makeAuthSupabase(),
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => makeCredentialSupabase(),
}));

vi.mock('@/lib/n8n-mcp-bridge', () => ({
  isN8nMcpConfigured: () => false,
  mcpGetNodeTypes: vi.fn(),
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { POST } from '@/app/api/n8n/load-options/route';

function request(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('POST /api/n8n/load-options (Airtable „Get List")', () => {
  it('liefert Bases, wenn das Frontend die n8n-Credential-ID sendet', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ bases: [{ id: 'app1', name: 'CRM' }] }),
    });

    const res = await POST(request({
      nodeType: 'n8n-nodes-base.airtable',
      propertyName: 'base',
      parameters: {},
      credentialId: N8N_CRED_ID,
    }));
    const body = await res.json();

    expect(body.source).toBe('airtable-api');
    expect(body.options).toEqual([{ name: 'CRM', value: 'app1' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.airtable.com/v0/meta/bases',
      { headers: { Authorization: 'Bearer pat-airtable-secret' } },
    );
  });

  it('akzeptiert auch die Supabase-Zeilen-ID (UUID) als credentialId', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ bases: [{ id: 'app2', name: 'Inventar' }] }),
    });

    const res = await POST(request({
      nodeType: 'n8n-nodes-base.airtable',
      propertyName: 'base',
      parameters: {},
      credentialId: SUPABASE_ROW_ID,
    }));
    const body = await res.json();

    expect(body.source).toBe('airtable-api');
    expect(body.options).toEqual([{ name: 'Inventar', value: 'app2' }]);
  });

  it('liefert Tables abhängig von der gewählten Base (resourceLocator-Wert)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tables: [{ id: 'tblA', name: 'Kontakte' }] }),
    });

    const res = await POST(request({
      nodeType: 'n8n-nodes-base.airtable',
      propertyName: 'table',
      parameters: { base: { __rl: true, mode: 'list', value: 'app1' } },
      credentialId: N8N_CRED_ID,
    }));
    const body = await res.json();

    expect(body.source).toBe('airtable-api');
    expect(body.options).toEqual([{ name: 'Kontakte', value: 'tblA' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.airtable.com/v0/meta/bases/app1/tables',
      { headers: { Authorization: 'Bearer pat-airtable-secret' } },
    );
  });

  it('fällt auf static zurück, wenn das Credential nicht gefunden wird (keine API-Anfrage)', async () => {
    const res = await POST(request({
      nodeType: 'n8n-nodes-base.airtable',
      propertyName: 'base',
      parameters: {},
      credentialId: 'unbekannteCredId99',
    }));
    const body = await res.json();

    expect(body.source).toBe('static');
    expect(body.options).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fällt auf static zurück, wenn für Tables noch keine Base gewählt ist', async () => {
    const res = await POST(request({
      nodeType: 'n8n-nodes-base.airtable',
      propertyName: 'table',
      parameters: {},
      credentialId: N8N_CRED_ID,
    }));
    const body = await res.json();

    expect(body.source).toBe('static');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fällt auf static zurück, wenn die Airtable-API einen Fehler liefert (statt 500)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });

    const res = await POST(request({
      nodeType: 'n8n-nodes-base.airtable',
      propertyName: 'base',
      parameters: {},
      credentialId: N8N_CRED_ID,
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe('static');
  });
});
