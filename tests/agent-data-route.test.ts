import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/machine-auth', () => ({
  resolveCaller: vi.fn(),
}));
vi.mock('@/lib/data-layer', () => ({
  getOrCreateTable: vi.fn(),
}));

import { resolveCaller } from '@/lib/machine-auth';
import { getOrCreateTable } from '@/lib/data-layer';
import { GET, POST } from '@/app/api/agent/data/route';

const mockResolveCaller = vi.mocked(resolveCaller);
const mockGetOrCreateTable = vi.mocked(getOrCreateTable);

const TABLE = { id: 'tbl-1', project_id: 'p1', table_name: 'leads_followup' };

/** Chainable query-builder mock covering select/insert/update/delete as used by the route. */
function makeBuilder(finalResult: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {
    select: (...args: unknown[]) => { calls.select = args; return builder; },
    eq: (...args: unknown[]) => { (calls.eq ??= []).push(args); return builder; },
    contains: (...args: unknown[]) => { calls.contains = args; return builder; },
    order: (...args: unknown[]) => { calls.order = args; return builder; },
    limit: (...args: unknown[]) => { calls.limit = args; return builder; },
    insert: (...args: unknown[]) => { calls.insert = args; return builder; },
    update: (...args: unknown[]) => { calls.update = args; return builder; },
    delete: (...args: unknown[]) => { calls.delete = args; return builder; },
    single: () => Promise.resolve(finalResult),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(finalResult).then(res, rej),
  };
  return { builder, calls };
}

function makeSupabase(finalResult: { data: unknown; error: unknown }) {
  const { builder, calls } = makeBuilder(finalResult);
  const client = { from: () => builder } as unknown as SupabaseClient;
  return { client, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOrCreateTable.mockResolvedValue(TABLE as never);
});

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/agent/data', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function getReq(qs: string) {
  return new NextRequest(`http://localhost/api/agent/data?${qs}`);
}

describe('POST /api/agent/data — op validation', () => {
  it('rejects an unknown op with 400', async () => {
    mockResolveCaller.mockResolvedValue({ supabase: {} as SupabaseClient, userId: 'u1' });
    const res = await POST(postReq({ project_id: 'p1', table: 'x', op: 'nonsense' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/op must be one of/);
  });

  it('rejects delete without id or filter', async () => {
    const { client } = makeSupabase({ data: [], error: null });
    mockResolveCaller.mockResolvedValue({ supabase: client, userId: 'u1' });
    const res = await POST(postReq({ project_id: 'p1', table: 'x', op: 'delete' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/id or filter required/);
  });

  it('rejects a non-object filter', async () => {
    mockResolveCaller.mockResolvedValue({ supabase: {} as SupabaseClient, userId: 'u1' });
    const res = await POST(postReq({ project_id: 'p1', table: 'x', op: 'select', filter: 'nope' }));
    expect(res.status).toBe(400);
  });

  it('propagates resolveCaller errors (e.g. missing/invalid token)', async () => {
    mockResolveCaller.mockResolvedValue({ error: 'project not found', status: 404 });
    const res = await POST(postReq({ project_id: 'p1', table: 'x', op: 'select' }));
    expect(res.status).toBe(404);
  });

  it('requires project_id and table', async () => {
    mockResolveCaller.mockResolvedValue({ supabase: {} as SupabaseClient, userId: 'u1' });
    const res = await POST(postReq({ op: 'select' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/agent/data — insert', () => {
  it('inserts a single row via `row`', async () => {
    const { client, calls } = makeSupabase({ data: [{ id: 'r1', data: { a: 1 } }], error: null });
    mockResolveCaller.mockResolvedValue({ supabase: client, userId: 'u1' });

    const res = await POST(postReq({ project_id: 'p1', table: 'x', op: 'insert', row: { a: 1 } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rows).toEqual([{ id: 'r1', data: { a: 1 } }]);
    expect(calls.insert).toBeDefined();
    const payload = (calls.insert as unknown[])[0] as Array<Record<string, unknown>>;
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ table_id: 'tbl-1', project_id: 'p1', user_id: 'u1', data: { a: 1 } });
  });

  it('inserts multiple rows via `rows`', async () => {
    const { client, calls } = makeSupabase({ data: [{ id: 'r1' }, { id: 'r2' }], error: null });
    mockResolveCaller.mockResolvedValue({ supabase: client, userId: 'u1' });

    const res = await POST(
      postReq({ project_id: 'p1', table: 'x', op: 'insert', rows: [{ a: 1 }, { b: 2 }] }),
    );
    expect(res.status).toBe(200);
    const payload = (calls.insert as unknown[])[0] as unknown[];
    expect(payload).toHaveLength(2);
  });

  it('rejects more than 100 rows', async () => {
    mockResolveCaller.mockResolvedValue({ supabase: {} as SupabaseClient, userId: 'u1' });
    const rows = Array.from({ length: 101 }, (_, i) => ({ i }));
    const res = await POST(postReq({ project_id: 'p1', table: 'x', op: 'insert', rows }));
    expect(res.status).toBe(400);
  });

  it('rejects non-object rows', async () => {
    mockResolveCaller.mockResolvedValue({ supabase: {} as SupabaseClient, userId: 'u1' });
    const res = await POST(postReq({ project_id: 'p1', table: 'x', op: 'insert', rows: ['nope'] }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/agent/data — select', () => {
  it('requires table', async () => {
    mockResolveCaller.mockResolvedValue({ supabase: {} as SupabaseClient, userId: 'u1' });
    const res = await GET(getReq('project_id=p1'));
    expect(res.status).toBe(400);
  });

  it('returns rows for a valid select', async () => {
    const { client } = makeSupabase({ data: [{ id: 'r1' }], error: null });
    mockResolveCaller.mockResolvedValue({ supabase: client, userId: 'u1' });
    const res = await GET(getReq('project_id=p1&table=leads_followup'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rows).toEqual([{ id: 'r1' }]);
  });

  it('builds containment filter from JSON query param', async () => {
    const { client, calls } = makeSupabase({ data: [], error: null });
    mockResolveCaller.mockResolvedValue({ supabase: client, userId: 'u1' });
    const res = await GET(
      getReq(`project_id=p1&table=x&filter=${encodeURIComponent(JSON.stringify({ status: 'neu' }))}`),
    );
    expect(res.status).toBe(200);
    expect(calls.contains).toEqual(['data', { status: 'neu' }]);
  });
});
