/**
 * Tests für resolveOpenAiCaller (lib/machine-auth.ts) — Composite-Key-Parsing
 * "<WORKSPACE_API_TOKEN>.<project_id>" für die openAiApi-kompatible n8n-Credential.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const TOKEN = 'super-secret-workspace-token';
const PROJECT_ID = '11111111-2222-4333-8444-555555555555';
const OWNER_ID = '99999999-8888-4777-8666-555555555555';

function makeSupabase(projectRow: { user_id: string } | null) {
  return {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: projectRow }),
        }),
      }),
    }),
  };
}

let projectRow: { user_id: string } | null = { user_id: OWNER_ID };

vi.mock('@/lib/supabase', () => ({
  createSupabaseServiceClient: () => makeSupabase(projectRow),
}));

import { resolveOpenAiCaller } from '@/lib/machine-auth';

function request(authHeader: string | null): NextRequest {
  return {
    headers: { get: (name: string) => (name.toLowerCase() === 'authorization' ? authHeader : null) },
  } as unknown as NextRequest;
}

describe('resolveOpenAiCaller', () => {
  beforeEach(() => {
    process.env.WORKSPACE_API_TOKEN = TOKEN;
    projectRow = { user_id: OWNER_ID };
  });
  afterEach(() => {
    delete process.env.WORKSPACE_API_TOKEN;
  });

  it('resolves the project owner from a well-formed key (split on the LAST dot)', async () => {
    const res = await resolveOpenAiCaller(request(`Bearer ${TOKEN}.${PROJECT_ID}`));
    expect('error' in res).toBe(false);
    if (!('error' in res)) expect(res.userId).toBe(OWNER_ID);
  });

  it('handles a token part that itself contains dots (project_id has none — split on the last dot)', async () => {
    process.env.WORKSPACE_API_TOKEN = 'abc.def.ghi';
    const res = await resolveOpenAiCaller(request(`Bearer abc.def.ghi.${PROJECT_ID}`));
    expect('error' in res).toBe(false);
    if (!('error' in res)) expect(res.userId).toBe(OWNER_ID);
  });

  it('rejects a missing project id (no dot in the key)', async () => {
    const res = await resolveOpenAiCaller(request(`Bearer ${TOKEN}`));
    expect('error' in res).toBe(true);
    if ('error' in res) expect(res.status).toBe(401);
  });

  it('rejects a key ending in a dot (empty project id)', async () => {
    const res = await resolveOpenAiCaller(request(`Bearer ${TOKEN}.`));
    expect('error' in res).toBe(true);
    if ('error' in res) expect(res.status).toBe(401);
  });

  it('rejects a wrong token part', async () => {
    const res = await resolveOpenAiCaller(request(`Bearer wrong-token.${PROJECT_ID}`));
    expect('error' in res).toBe(true);
    if ('error' in res) expect(res.status).toBe(401);
  });

  it('rejects a missing Authorization header', async () => {
    const res = await resolveOpenAiCaller(request(null));
    expect('error' in res).toBe(true);
    if ('error' in res) expect(res.status).toBe(401);
  });

  it('returns 404 when the project does not exist', async () => {
    projectRow = null;
    const res = await resolveOpenAiCaller(request(`Bearer ${TOKEN}.${PROJECT_ID}`));
    expect('error' in res).toBe(true);
    if ('error' in res) expect(res.status).toBe(404);
  });

  it('returns 500 when WORKSPACE_API_TOKEN is not configured', async () => {
    delete process.env.WORKSPACE_API_TOKEN;
    const res = await resolveOpenAiCaller(request(`Bearer x.${PROJECT_ID}`));
    expect('error' in res).toBe(true);
    if ('error' in res) expect(res.status).toBe(500);
  });
});
