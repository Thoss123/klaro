import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertProjectOwner,
  assertSessionOwner,
  requireUser,
} from '@/lib/access-control';

function chainMaybeSingle(data: { id: string } | null) {
  return {
    eq: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data, error: null }),
      }),
    }),
  };
}

function mockSupabase(opts: {
  user?: { id: string } | null;
  lookup?: { id: string } | null;
}): SupabaseClient {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user ?? null } }),
    },
    from: () => ({
      select: () => chainMaybeSingle(opts.lookup ?? null),
    }),
  } as unknown as SupabaseClient;
}

describe('requireUser', () => {
  it('returns 401 when not logged in', async () => {
    const result = await requireUser(mockSupabase({}));
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('returns userId when logged in', async () => {
    const result = await requireUser(mockSupabase({ user: { id: 'user-1' } }));
    expect(result).toEqual({ ok: true, userId: 'user-1' });
  });
});

describe('assertProjectOwner', () => {
  it('returns 403 when project not owned', async () => {
    const result = await assertProjectOwner(mockSupabase({ lookup: null }), 'user-1', 'proj-1');
    expect(result).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });

  it('returns ok when project owned', async () => {
    const result = await assertProjectOwner(
      mockSupabase({ lookup: { id: 'proj-1' } }),
      'user-1',
      'proj-1',
    );
    expect(result).toEqual({ ok: true, userId: 'user-1' });
  });
});

describe('assertSessionOwner', () => {
  it('returns 403 when session not owned', async () => {
    const result = await assertSessionOwner(mockSupabase({ lookup: null }), 'user-1', 'sess-1');
    expect(result).toEqual({ ok: false, status: 403, error: 'Forbidden' });
  });

  it('returns ok when session owned', async () => {
    const result = await assertSessionOwner(
      mockSupabase({ lookup: { id: 'sess-1' } }),
      'user-1',
      'sess-1',
    );
    expect(result).toEqual({ ok: true, userId: 'user-1' });
  });
});
