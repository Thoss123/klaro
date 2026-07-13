/**
 * Tests für lib/bernd/telegram-dispatch.ts — dispatchDirectives() ist das fehlende Stück
 * aus dem Architekturplan §WP6: der Telegram-Adapter verwarf bisher `directives[]` komplett,
 * ein erfolgreiches `trigger_flow` (z.B. nach einer HITL-Freigabe) verpuffte. Diese Datei
 * führt genau diese Directives aus und wird hier isoliert von der Route getestet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchDirectives } from '@/lib/bernd/telegram-dispatch';
import type { BerndConfig, RouterDirective } from '@/lib/bernd/types';

const baseConfig = (activeTemplates: BerndConfig['active_templates']): BerndConfig => ({
  project_id: 'p1',
  user_id: 'u1',
  gewerk: 'elektriker',
  status: 'active',
  preislogik: {},
  tools: {},
  notify_rules: {},
  active_templates: activeTemplates,
  steckbrief: {},
  setup_state: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

describe('dispatchDirectives', () => {
  const prevN8nUrl = process.env.N8N_API_URL;

  beforeEach(() => {
    process.env.N8N_API_URL = 'https://n8n.example.com/api/v1';
  });

  afterEach(() => {
    process.env.N8N_API_URL = prevN8nUrl;
    vi.unstubAllGlobals();
  });

  it('skips reply and config directives without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const directives: RouterDirective[] = [
      { kind: 'reply', text: 'Alles klar.' },
      { kind: 'config', text: 'Preis gesetzt.' },
    ];
    const hints = await dispatchDirectives({
      directives,
      config: baseConfig([]),
      chatId: 'chat1',
      projectId: 'p1',
    });

    expect(hints).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prefers a scalar key containing "SEND" as the webhook path when multiple _WEBHOOK_PATH candidates exist', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const config = baseConfig([
      {
        slug: 'email-triage-draft',
        n8n_workflow_id: 'wf1',
        scalars: {
          OFFER_APPROVAL_WEBHOOK_PATH: 'angebot-freigabe-abc123',
          EMAIL_SEND_WEBHOOK_PATH: 'email-send-abc123',
        },
      },
    ]);

    const hints = await dispatchDirectives({
      directives: [{ kind: 'trigger_flow', flow_slug: 'email-triage-draft', args: { approved: true } }],
      config,
      chatId: 'chat1',
      projectId: 'p1',
    });

    expect(hints).toEqual([]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://n8n.example.com/webhook/email-send-abc123');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ project_id: 'p1', chat_id: 'chat1', approved: true });
  });

  it('falls back to the first _WEBHOOK_PATH scalar when none contains "SEND"', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const config = baseConfig([
      {
        slug: 'rechnung-mahnwesen',
        n8n_workflow_id: 'wf2',
        scalars: { ORDER_DONE_WEBHOOK_PATH: 'auftrag-fertig-xyz789' },
      },
    ]);

    const hints = await dispatchDirectives({
      directives: [{ kind: 'trigger_flow', flow_slug: 'rechnung-mahnwesen' }],
      config,
      chatId: 'chat1',
      projectId: 'p1',
    });

    expect(hints).toEqual([]);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://n8n.example.com/webhook/auftrag-fertig-xyz789');
  });

  it('returns a human hint instead of throwing when the flow is not in active_templates', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const hints = await dispatchDirectives({
      directives: [{ kind: 'trigger_flow', flow_slug: 'angebot-autopilot' }],
      config: baseConfig([]),
      chatId: 'chat1',
      projectId: 'p1',
    });

    expect(hints).toEqual(['Flow "angebot-autopilot" ist bei diesem Betrieb nicht eingerichtet.']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a hint when the directive carries no flow_slug', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const hints = await dispatchDirectives({
      directives: [{ kind: 'trigger_flow' }],
      config: baseConfig([]),
      chatId: 'chat1',
      projectId: 'p1',
    });

    expect(hints).toEqual(['Konnte einen Flow nicht auslösen — die Direktive enthielt keinen Flow-Slug.']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a hint when the active template has no _WEBHOOK_PATH scalar at all', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const config = baseConfig([{ slug: 'followup-serie', n8n_workflow_id: 'wf3', scalars: { APP_BASE_URL: 'https://x' } }]);

    const hints = await dispatchDirectives({
      directives: [{ kind: 'trigger_flow', flow_slug: 'followup-serie' }],
      config,
      chatId: 'chat1',
      projectId: 'p1',
    });

    expect(hints).toEqual(['Flow "followup-serie" hat noch keinen Versand-Webhook hinterlegt — bitte im Dashboard prüfen.']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a hint (never throws) when fetch rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const config = baseConfig([
      { slug: 'email-triage-draft', n8n_workflow_id: 'wf1', scalars: { EMAIL_SEND_WEBHOOK_PATH: 'email-send-abc' } },
    ]);

    const hints = await dispatchDirectives({
      directives: [{ kind: 'trigger_flow', flow_slug: 'email-triage-draft' }],
      config,
      chatId: 'chat1',
      projectId: 'p1',
    });

    expect(hints).toEqual(['Versand-Flow "email-triage-draft" konnte nicht erreicht werden: network down']);
  });

  it('returns a hint when the n8n webhook responds with a non-ok status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    const config = baseConfig([
      { slug: 'email-triage-draft', n8n_workflow_id: 'wf1', scalars: { EMAIL_SEND_WEBHOOK_PATH: 'email-send-abc' } },
    ]);

    const hints = await dispatchDirectives({
      directives: [{ kind: 'trigger_flow', flow_slug: 'email-triage-draft' }],
      config,
      chatId: 'chat1',
      projectId: 'p1',
    });

    expect(hints).toEqual(['Versand-Flow "email-triage-draft" antwortete mit Fehler (500).']);
  });

  it('returns a hint when config is null (project has no bernd_configs row yet)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const hints = await dispatchDirectives({
      directives: [{ kind: 'trigger_flow', flow_slug: 'email-triage-draft' }],
      config: null,
      chatId: 'chat1',
      projectId: 'p1',
    });

    expect(hints).toEqual(['Flow "email-triage-draft" ist bei diesem Betrieb nicht eingerichtet.']);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
