import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrCreateTable } from '@/lib/data-layer';

type QResult = { data: unknown; error: unknown };

/**
 * Minimaler Mock-Client: `from('user_data_tables')` und `from('user_data_layer')` liefern
 * unabhängig konfigurierbare `maybeSingle`/`single`-Ergebnisse, `insert` wird aufgezeichnet.
 */
function createMockClient(opts: {
  tables?: { maybeSingle?: QResult; single?: QResult };
  layer?: { maybeSingle?: QResult; single?: QResult };
}) {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

  function builderFor(tableName: string) {
    const cfg = tableName === 'user_data_tables' ? opts.tables : opts.layer;
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      insert: (payload: Record<string, unknown>) => {
        inserts.push({ table: tableName, payload });
        return builder;
      },
      maybeSingle: () => Promise.resolve(cfg?.maybeSingle ?? { data: null, error: null }),
      single: () => Promise.resolve(cfg?.single ?? { data: null, error: null }),
    };
    return builder;
  }

  const client = { from: (t: string) => builderFor(t) } as unknown as SupabaseClient;
  return { client, inserts };
}

describe('getOrCreateTable', () => {
  it('returns the existing table without inserting', async () => {
    const existing = { id: 't1', project_id: 'p1', table_name: 'leads_followup' };
    const { client, inserts } = createMockClient({
      tables: { maybeSingle: { data: existing, error: null } },
    });

    const result = await getOrCreateTable(client, 'u1', 'p1', 'leads_followup');

    expect(result).toEqual(existing);
    expect(inserts).toHaveLength(0);
  });

  it('creates the table (and data layer) when none exists', async () => {
    const layer = { id: 'layer1', user_id: 'u1', project_id: 'p1' };
    const createdTable = { id: 't2', project_id: 'p1', table_name: 'invoices' };
    const { client, inserts } = createMockClient({
      tables: { maybeSingle: { data: null, error: null }, single: { data: createdTable, error: null } },
      layer: { maybeSingle: { data: layer, error: null } },
    });

    const result = await getOrCreateTable(client, 'u1', 'p1', 'invoices');

    expect(result).toEqual(createdTable);
    const tableInsert = inserts.find((i) => i.table === 'user_data_tables');
    expect(tableInsert?.payload).toMatchObject({
      layer_id: 'layer1',
      user_id: 'u1',
      project_id: 'p1',
      table_name: 'invoices',
    });
  });

  it('provisions a new data layer when none exists yet', async () => {
    const createdLayer = { id: 'layer2', user_id: 'u1', project_id: 'p1' };
    const createdTable = { id: 't3', project_id: 'p1', table_name: 'sync' };
    const { client } = createMockClient({
      tables: { maybeSingle: { data: null, error: null }, single: { data: createdTable, error: null } },
      layer: { maybeSingle: { data: null, error: null }, single: { data: createdLayer, error: null } },
    });

    const result = await getOrCreateTable(client, 'u1', 'p1', 'sync');
    expect(result).toEqual(createdTable);
  });

  it('returns null when the data layer cannot be provisioned', async () => {
    const { client } = createMockClient({
      tables: { maybeSingle: { data: null, error: null } },
      layer: {
        maybeSingle: { data: null, error: null },
        single: { data: null, error: { message: 'boom' } },
      },
    });

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await getOrCreateTable(client, 'u1', 'p1', 'broken');
    expect(result).toBeNull();
    errSpy.mockRestore();
  });
});
