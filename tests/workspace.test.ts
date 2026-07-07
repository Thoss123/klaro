import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildBaseRulesTemplate,
  COMPANY_BASE_PATH,
  ensureBaseRules,
  listWorkspaceFiles,
  personaPath,
  readWorkspaceFile,
  writeWorkspaceFile,
} from '@/lib/workspace';

type QResult = { data: unknown; error: unknown };

function createMockClient(opts: {
  maybeSingle?: QResult;
  single?: QResult;
  list?: QResult;
  onUpsert?: (payload: Record<string, unknown>) => void;
}) {
  const builder: Record<string, unknown> & { _upsertCalled: boolean } = {
    _upsertCalled: false,
    select: () => builder,
    eq: () => builder,
    like: () => builder,
    order: () => builder,
    limit: () => builder,
    upsert: (payload: Record<string, unknown>) => {
      builder._upsertCalled = true;
      opts.onUpsert?.(payload);
      return builder;
    },
    maybeSingle: () => Promise.resolve(opts.maybeSingle ?? { data: null, error: null }),
    single: () => Promise.resolve(opts.single ?? { data: null, error: null }),
    then: (res: (v: QResult) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(opts.list ?? { data: [], error: null }).then(res, rej),
  };
  const client = { from: () => builder } as unknown as SupabaseClient;
  return { client, builder };
}

describe('personaPath', () => {
  it('slugifies names into rules/persona_<slug>.md', () => {
    expect(personaPath('Thomas')).toBe('rules/persona_thomas.md');
    expect(personaPath('Anna-Lena Müller')).toBe('rules/persona_anna_lena_m_ller.md');
    expect(personaPath('   ')).toBe('rules/persona_default.md');
  });
});

describe('buildBaseRulesTemplate', () => {
  it('embeds the strategy block when provided', () => {
    expect(buildBaseRulesTemplate('Wir sind ein Friseursalon.')).toContain('Wir sind ein Friseursalon.');
  });
  it('omits the strategy block when empty', () => {
    expect(buildBaseRulesTemplate()).not.toContain('Ausgangswissen');
  });
});

describe('readWorkspaceFile', () => {
  it('returns the content when the row exists', async () => {
    const { client } = createMockClient({ maybeSingle: { data: { content: 'Hallo' }, error: null } });
    expect(await readWorkspaceFile(client, 'p1', COMPANY_BASE_PATH)).toBe('Hallo');
  });
  it('returns empty string when the file does not exist', async () => {
    const { client } = createMockClient({ maybeSingle: { data: null, error: null } });
    expect(await readWorkspaceFile(client, 'p1', 'rules/nope.md')).toBe('');
  });
});

describe('listWorkspaceFiles', () => {
  it('returns the file list', async () => {
    const rows = [{ path: 'rules/company_base.md', version: 3, updated_at: 'x' }];
    const { client } = createMockClient({ list: { data: rows, error: null } });
    expect(await listWorkspaceFiles(client, 'p1', 'rules/')).toEqual(rows);
  });
});

describe('writeWorkspaceFile', () => {
  it('upserts without a version field (DB trigger bumps it) and returns the row', async () => {
    let captured: Record<string, unknown> | undefined;
    const row = { id: 'f1', path: 'rules/company_base.md', version: 2 };
    const { client } = createMockClient({
      single: { data: row, error: null },
      onUpsert: (p) => { captured = p; },
    });

    const result = await writeWorkspaceFile(client, {
      userId: 'u1',
      projectId: 'p1',
      path: COMPANY_BASE_PATH,
      content: 'neu',
      updatedBy: 'flow2',
    });

    expect(result).toEqual(row);
    expect(captured).toMatchObject({ user_id: 'u1', project_id: 'p1', content: 'neu', updated_by: 'flow2' });
    expect(captured).not.toHaveProperty('version');
  });
});

describe('ensureBaseRules', () => {
  it('is idempotent: returns the existing file without writing', async () => {
    const existing = { id: 'f1', path: COMPANY_BASE_PATH, version: 5 };
    const { client, builder } = createMockClient({ maybeSingle: { data: existing, error: null } });

    const result = await ensureBaseRules(client, { userId: 'u1', projectId: 'p1' });

    expect(result).toEqual(existing);
    expect(builder._upsertCalled).toBe(false);
  });

  it('creates the base rules file when none exists', async () => {
    const created = { id: 'f2', path: COMPANY_BASE_PATH, version: 1 };
    const { client, builder } = createMockClient({
      maybeSingle: { data: null, error: null },
      single: { data: created, error: null },
    });

    const result = await ensureBaseRules(client, { userId: 'u1', projectId: 'p1', strategy: 'X' });

    expect(result).toEqual(created);
    expect(builder._upsertCalled).toBe(true);
  });
});
