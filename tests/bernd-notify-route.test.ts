import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/machine-auth', () => ({ resolveCaller: vi.fn() }));
vi.mock('@/lib/bernd/channel', () => ({ persistBerndMessage: vi.fn() }));
vi.mock('@/lib/bernd/telegram', () => ({ tgSendMessage: vi.fn() }));

import { resolveCaller } from '@/lib/machine-auth';
import { persistBerndMessage } from '@/lib/bernd/channel';
import { tgSendMessage } from '@/lib/bernd/telegram';
import { POST } from '@/app/api/bernd/notify/route';

const mockResolveCaller = vi.mocked(resolveCaller);
const mockPersist = vi.mocked(persistBerndMessage);
const mockSend = vi.mocked(tgSendMessage);

function request(body: unknown) {
  return new NextRequest('http://localhost/api/bernd/notify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function supabaseWithLink(chatId: string | null) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    not: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve({ data: chatId ? { chat_id: chatId } : null, error: null }),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSend.mockResolvedValue(undefined);
  mockPersist.mockResolvedValue(undefined);
});

describe('POST /api/bernd/notify', () => {
  it('rejects incomplete payloads', async () => {
    const response = await POST(request({ project_id: 'p1' }));
    expect(response.status).toBe(400);
    expect(mockResolveCaller).not.toHaveBeenCalled();
  });

  it('requires a verified Telegram pairing', async () => {
    mockResolveCaller.mockResolvedValue({ supabase: supabaseWithLink(null), userId: 'u1' });
    const response = await POST(request({ project_id: 'p1', text: 'Hinweis' }));
    expect(response.status).toBe(409);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends and persists a workflow notification', async () => {
    const supabase = supabaseWithLink('chat-1');
    mockResolveCaller.mockResolvedValue({ supabase, userId: 'u1' });

    const response = await POST(
      request({ project_id: 'p1', text: 'Neue Eingangsrechnung', kind: 'vendor_billing' }),
    );

    expect(response.status).toBe(200);
    expect(mockSend).toHaveBeenCalledWith('chat-1', 'Neue Eingangsrechnung');
    expect(mockPersist).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        project_id: 'p1',
        chat_id: 'chat-1',
        content: 'Neue Eingangsrechnung',
        meta: { kind: 'vendor_billing' },
      }),
    );
  });
});
