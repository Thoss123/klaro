/**
 * Regressionstest für den Integrations-Fix in app/api/bernd/router/route.ts#handleHitl:
 * die Telegram-Bestätigung ("ja"/"nein") auf eine offene `agent_pending_actions`-Zeile
 * prüfte den Status per SELECT und aktualisierte danach per separatem UPDATE ohne erneuten
 * `status='pending'`-Filter (TOCTOU) — eine zeitgleiche Dashboard-Freigabe/-Ablehnung
 * (`PATCH /api/agent/pending`, die selbst atomar mit `.eq('status','pending')` guardet) konnte
 * dadurch überschrieben werden. Der Fix macht das UPDATE selbst atomar (Guard direkt im
 * `.update().eq('status','pending')`), analog zu app/api/agent/pending/route.ts.
 *
 * Dieser Test treibt den echten Router-POST-Handler durch den HITL-Pfad (eine offene pending
 * Action existiert bereits), mit einer Supabase-Mock-Tabelle, die eine gewonnene bzw. eine
 * verlorene Race simulieren kann.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/machine-auth', () => ({ resolveCaller: vi.fn() }));
vi.mock('@/lib/billing/credits', () => ({
  canAfford: vi.fn(),
  debitFromUsage: vi.fn(),
}));
vi.mock('@/lib/bernd/channel', () => ({
  loadRecentMessages: vi.fn(),
  persistBerndMessage: vi.fn(),
  resolveProjectByChatId: vi.fn(),
  verifyPairing: vi.fn(),
}));

import { resolveCaller } from '@/lib/machine-auth';
import { canAfford, debitFromUsage } from '@/lib/billing/credits';
import { loadRecentMessages, persistBerndMessage } from '@/lib/bernd/channel';
import { POST } from '@/app/api/bernd/router/route';

const mockResolveCaller = vi.mocked(resolveCaller);
const mockCanAfford = vi.mocked(canAfford);
const mockDebitFromUsage = vi.mocked(debitFromUsage);
const mockLoadRecentMessages = vi.mocked(loadRecentMessages);
const mockPersistBerndMessage = vi.mocked(persistBerndMessage);

const PENDING_ROW = {
  id: 'pending-1',
  project_id: 'p1',
  contact: 'chat1',
  kind: 'draft_approval',
  payload: { draft: 'Hallo Kunde', subject: 'Re: Anfrage', mail_ref: 'msg-1', flow_slug: 'email-triage-draft' },
  status: 'pending',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

/**
 * Simuliert `agent_pending_actions`: der erste `.maybeSingle()`-Aufruf (SELECT, POST-Handler
 * sucht eine offene pending-Zeile für den Chat) liefert immer die Zeile im Status "pending".
 * Ein danach folgender `.update(...)`-Aufruf landet — je nach `raceLost` — entweder normal
 * (kein Wettlauf) oder simuliert, dass eine andere Instanz (Dashboard-PATCH) die Zeile
 * zwischen SELECT und UPDATE bereits aufgelöst hat: die guardete Update-Query
 * (`.eq('status','pending')`) trifft dann keine Zeile mehr → `data: null`.
 */
function makeSupabase(opts: { raceLost: boolean }) {
  let updatePatch: Record<string, unknown> | null = null;
  const eqCalls: Array<[string, unknown]> = [];

  const builder: Record<string, unknown> = {
    select: () => builder,
    update: (patch: Record<string, unknown>) => {
      updatePatch = patch;
      return builder;
    },
    eq: (col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => {
      if (!updatePatch) {
        // Erster Aufruf: der pending-Lookup im POST-Handler.
        return Promise.resolve({ data: PENDING_ROW, error: null });
      }
      // Zweiter Aufruf: das guardete UPDATE aus handleHitl.
      if (opts.raceLost) {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: { ...PENDING_ROW, ...updatePatch }, error: null });
    },
  };

  const client = { from: () => builder } as unknown as SupabaseClient;
  return { client, getUpdatePatch: () => updatePatch, getEqCalls: () => eqCalls };
}

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/bernd/router', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCanAfford.mockResolvedValue({ ok: true } as never);
  mockLoadRecentMessages.mockResolvedValue([]);
  mockPersistBerndMessage.mockResolvedValue(undefined as never);
  mockDebitFromUsage.mockResolvedValue(undefined as never);
});

describe('POST /api/bernd/router — HITL confirm race guard', () => {
  it('approves and triggers the flow when no concurrent resolution happened', async () => {
    const { client, getEqCalls } = makeSupabase({ raceLost: false });
    mockResolveCaller.mockResolvedValue({ supabase: client, userId: 'u1' });

    const res = await POST(postReq({ chat_id: 'chat1', text: 'ja', project_id: 'p1' }));
    expect(res.status).toBe(200);
    const json = await res.json();

    const flowDirective = json.directives.find((d: { kind: string }) => d.kind === 'trigger_flow');
    expect(flowDirective).toBeDefined();
    expect(flowDirective.flow_slug).toBe('email-triage-draft');
    expect(flowDirective.args.approved).toBe(true);
    expect(json.text).toBe('Alles klar, wird versendet. ✅');

    // Der UPDATE muss den atomaren Guard tragen — sonst wäre der Fix nicht wirksam.
    const eqCols = getEqCalls().map(([col]) => col);
    expect(eqCols.filter((c) => c === 'status').length).toBeGreaterThanOrEqual(1);
  });

  it('replies "nicht mehr offen" instead of double-triggering when the row was resolved concurrently', async () => {
    const { client } = makeSupabase({ raceLost: true });
    mockResolveCaller.mockResolvedValue({ supabase: client, userId: 'u1' });

    const res = await POST(postReq({ chat_id: 'chat1', text: 'ja', project_id: 'p1' }));
    expect(res.status).toBe(200);
    const json = await res.json();

    // Race verloren → KEIN trigger_flow, nur eine ehrliche reply-Direktive.
    expect(json.directives).toEqual([
      {
        kind: 'reply',
        text: 'Der Entwurf ist nicht mehr offen — evtl. schon erledigt. Sag mir gern, was als Nächstes ansteht.',
      },
    ]);
  });

  it('cancel path also respects the race guard', async () => {
    const { client } = makeSupabase({ raceLost: true });
    mockResolveCaller.mockResolvedValue({ supabase: client, userId: 'u1' });

    const res = await POST(postReq({ chat_id: 'chat1', text: 'nein', project_id: 'p1' }));
    const json = await res.json();
    expect(json.directives).toEqual([
      { kind: 'reply', text: 'Der Entwurf ist nicht mehr offen — evtl. schon erledigt.' },
    ]);
  });

  it('cancel path succeeds normally when there is no race', async () => {
    const { client } = makeSupabase({ raceLost: false });
    mockResolveCaller.mockResolvedValue({ supabase: client, userId: 'u1' });

    const res = await POST(postReq({ chat_id: 'chat1', text: 'nein', project_id: 'p1' }));
    const json = await res.json();
    expect(json.directives).toEqual([{ kind: 'reply', text: 'Abgebrochen — der Entwurf wird nicht gesendet.' }]);
  });
});
