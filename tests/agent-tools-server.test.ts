import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ASSISTANT_TOOLS,
  assistantToolsForMistral,
  getServerTool,
  type ToolContext,
} from '@/lib/agent-tools-server';

function ctxWithPending(rows: unknown[]): ToolContext {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  const supabase = { from: () => builder } as unknown as SupabaseClient;
  return { supabase, projectId: 'p1' };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ASSISTANT_CALENDAR_WEBHOOK_URL;
  delete process.env.ASSISTANT_CRM_WEBHOOK_URL;
});

describe('ASSISTANT_TOOLS registry', () => {
  it('exposes unique tools in Mistral function format', () => {
    const defs = assistantToolsForMistral();
    expect(defs.every((d) => d.type === 'function' && d.function.name)).toBe(true);
    const names = ASSISTANT_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(['list_pending_drafts', 'get_calendar', 'crm_lookup']));
  });
});

describe('list_pending_drafts', () => {
  it('summarizes pending drafts from the DB', async () => {
    const ctx = ctxWithPending([
      { payload: { send_target: 'a@x.de', subject: 'Anfrage', category: 'lead_inquiry' }, updated_at: 't1' },
      { payload: { send_target: 'b@x.de', subject: 'Termin', category: 'scheduling' }, updated_at: 't2' },
    ]);
    const result = (await getServerTool('list_pending_drafts')!.execute(ctx, {})) as {
      count: number;
      drafts: Array<{ empfaenger: string; betreff: string; kategorie: string }>;
    };
    expect(result.count).toBe(2);
    expect(result.drafts[0]).toMatchObject({ empfaenger: 'a@x.de', betreff: 'Anfrage', kategorie: 'lead_inquiry' });
  });

  it('returns an empty list when nothing is pending', async () => {
    const result = (await getServerTool('list_pending_drafts')!.execute(ctxWithPending([]), {})) as { count: number };
    expect(result.count).toBe(0);
  });
});

describe('get_calendar / crm_lookup graceful degradation', () => {
  const ctx = ctxWithPending([]);

  it('reports not-connected when no webhook is configured', async () => {
    const cal = (await getServerTool('get_calendar')!.execute(ctx, {})) as { connected: boolean };
    const crm = (await getServerTool('crm_lookup')!.execute(ctx, { query: 'x' })) as { connected: boolean };
    expect(cal.connected).toBe(false);
    expect(crm.connected).toBe(false);
  });

  it('calls the configured webhook when the env is set', async () => {
    process.env.ASSISTANT_CALENDAR_WEBHOOK_URL = 'https://n8n.example.com/webhook/cal';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    const cal = (await getServerTool('get_calendar')!.execute(ctx, { days: 3 })) as { connected: boolean; data: unknown };
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(cal.connected).toBe(true);
    expect(cal.data).toEqual({ events: [] });
  });
});
