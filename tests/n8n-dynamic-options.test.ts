import { describe, expect, it, vi } from 'vitest';
import {
  extractResourceLocatorValue,
  fetchAirtableOptions,
  isUuid,
  supportsDynamicOptions,
  type FetchLike,
} from '@/lib/n8n-dynamic-options';

function mockFetch(routes: Record<string, { ok: boolean; body?: unknown }>): FetchLike & ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string) => {
    const match = routes[url];
    if (!match) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: match.ok, status: match.ok ? 200 : 401, json: async () => match.body ?? {} };
  });
}

describe('extractResourceLocatorValue', () => {
  it('unwraps resourceLocator objects ({ mode, value })', () => {
    expect(extractResourceLocatorValue({ __rl: true, mode: 'list', value: 'appX' })).toBe('appX');
    expect(extractResourceLocatorValue({ mode: 'id', value: 'appY' })).toBe('appY');
  });

  it('passes through plain strings and numbers', () => {
    expect(extractResourceLocatorValue('appZ')).toBe('appZ');
    expect(extractResourceLocatorValue(42)).toBe('42');
  });

  it('returns null for empty/missing values', () => {
    expect(extractResourceLocatorValue(undefined)).toBeNull();
    expect(extractResourceLocatorValue(null)).toBeNull();
    expect(extractResourceLocatorValue('')).toBeNull();
    expect(extractResourceLocatorValue({ mode: 'list', value: '' })).toBeNull();
    expect(extractResourceLocatorValue({})).toBeNull();
  });
});

describe('isUuid', () => {
  it('matches Supabase row ids (UUID)', () => {
    expect(isUuid('00000000-0000-4000-8000-000000000001')).toBe(true);
  });

  it('rejects n8n credential ids (nanoid) and junk', () => {
    expect(isUuid('vJ2xJ8sJ3kQ9aBc1')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid('not-a-uuid')).toBe(false);
  });
});

describe('supportsDynamicOptions', () => {
  it('covers Airtable base/table', () => {
    expect(supportsDynamicOptions('n8n-nodes-base.airtable', 'base')).toBe(true);
    expect(supportsDynamicOptions('n8n-nodes-base.airtable', 'table')).toBe(true);
  });

  it('rejects other nodes/properties', () => {
    expect(supportsDynamicOptions('n8n-nodes-base.airtable', 'operation')).toBe(false);
    expect(supportsDynamicOptions('n8n-nodes-base.slack', 'base')).toBe(false);
  });
});

describe('fetchAirtableOptions', () => {
  it('lists bases via the Airtable meta API', async () => {
    const fetchImpl = mockFetch({
      'https://api.airtable.com/v0/meta/bases': {
        ok: true,
        body: { bases: [{ id: 'app1', name: 'CRM' }, { id: 'app2', name: 'Inventar' }] },
      },
    });
    const options = await fetchAirtableOptions({ token: 'pat-x', propertyName: 'base', fetchImpl });
    expect(options).toEqual([
      { name: 'CRM', value: 'app1' },
      { name: 'Inventar', value: 'app2' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.airtable.com/v0/meta/bases',
      { headers: { Authorization: 'Bearer pat-x' } },
    );
  });

  it('lists tables for the base from a resourceLocator parameter', async () => {
    const fetchImpl = mockFetch({
      'https://api.airtable.com/v0/meta/bases/app1/tables': {
        ok: true,
        body: { tables: [{ id: 'tblA', name: 'Kontakte' }] },
      },
    });
    const options = await fetchAirtableOptions({
      token: 'pat-x',
      propertyName: 'table',
      parameters: { base: { __rl: true, mode: 'list', value: 'app1' } },
      fetchImpl,
    });
    expect(options).toEqual([{ name: 'Kontakte', value: 'tblA' }]);
  });

  it('also accepts a plain-string base id', async () => {
    const fetchImpl = mockFetch({
      'https://api.airtable.com/v0/meta/bases/app9/tables': {
        ok: true,
        body: { tables: [{ id: 'tblB', name: 'Aufgaben' }] },
      },
    });
    const options = await fetchAirtableOptions({
      token: 'pat-x',
      propertyName: 'table',
      parameters: { base: 'app9' },
      fetchImpl,
    });
    expect(options).toEqual([{ name: 'Aufgaben', value: 'tblB' }]);
  });

  it('returns null for tables when no base is selected yet', async () => {
    const fetchImpl = mockFetch({});
    const options = await fetchAirtableOptions({ token: 'pat-x', propertyName: 'table', parameters: {}, fetchImpl });
    expect(options).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns null on API errors (e.g. invalid token) instead of throwing', async () => {
    const fetchImpl = mockFetch({
      'https://api.airtable.com/v0/meta/bases': { ok: false },
    });
    const options = await fetchAirtableOptions({ token: 'bad', propertyName: 'base', fetchImpl });
    expect(options).toBeNull();
  });

  it('returns null for unsupported properties', async () => {
    const fetchImpl = mockFetch({});
    const options = await fetchAirtableOptions({ token: 'pat-x', propertyName: 'operation', fetchImpl });
    expect(options).toBeNull();
  });
});
