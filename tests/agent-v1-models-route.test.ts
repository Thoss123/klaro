/**
 * Test für GET /api/agent/v1/models — n8n prüft eine openAiApi-Credential beim
 * Speichern mit genau diesem Aufruf (Bearer-Auth, OpenAI list-Shape).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const TOKEN = 'test-workspace-token';
const PROJECT_ID = '11111111-2222-4333-8444-555555555555';
const OWNER_ID = '99999999-8888-4777-8666-555555555555';

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { user_id: OWNER_ID } }),
        }),
      }),
    }),
  }),
}));

import { GET } from '@/app/api/agent/v1/models/route';

function request(authHeader: string | null): NextRequest {
  return {
    headers: { get: (name: string) => (name.toLowerCase() === 'authorization' ? authHeader : null) },
  } as unknown as NextRequest;
}

describe('GET /api/agent/v1/models', () => {
  beforeEach(() => {
    process.env.WORKSPACE_API_TOKEN = TOKEN;
  });
  afterEach(() => {
    delete process.env.WORKSPACE_API_TOKEN;
  });

  it('returns the OpenAI list shape with the allowed Mistral models', async () => {
    const res = await GET(request(`Bearer ${TOKEN}.${PROJECT_ID}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('list');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    for (const m of body.data) {
      expect(m.object).toBe('model');
      expect(typeof m.id).toBe('string');
    }
    expect(body.data.map((m: { id: string }) => m.id)).toEqual(
      expect.arrayContaining(['mistral-small-latest', 'mistral-medium-latest']),
    );
  });

  it('rejects an invalid bearer token with an OpenAI-shaped error', async () => {
    const res = await GET(request('Bearer wrong.token'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.type).toBe('authentication_error');
  });
});
