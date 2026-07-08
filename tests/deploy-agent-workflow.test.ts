import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildEmailAutomation, deployEmailAutomation } from '@/lib/deploy-agent-workflow';

/** Mock: user_credentials-Lookup liefert (oder nicht) eine n8n-Credential-ID. */
function supabaseWithMailCred(credId: string | null): SupabaseClient {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: credId ? { n8n_credential_id: credId } : null, error: null }),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

const ENV_BACKUP = { ...process.env };
beforeEach(() => {
  process.env.N8N_CREDENTIAL_WORKSPACE_TOKEN = 'wtok-1';
  process.env.N8N_CREDENTIAL_TWILIO = 'tw-1';
  process.env.N8N_API_URL = 'https://n8n.example.com/api/v1';
});
afterEach(() => {
  process.env = { ...ENV_BACKUP };
});

const BASE_ARGS = {
  userId: 'u1',
  projectId: '712db8db-bd73-4392-915e-e9fa1a4ea744',
  ownerWhatsapp: '+4367762853686',
  personaPath: 'rules/persona_thomas.md',
  appBaseUrl: 'https://www.axantilo.com',
  approvalMode: 'whatsapp' as const,
};

describe('buildEmailAutomation', () => {
  it('builds all three workflows with slots filled and no leftovers', async () => {
    const built = await buildEmailAutomation(supabaseWithMailCred('gmailcred-9'), {
      ...BASE_ARGS,
      mailProvider: 'gmail',
    });
    expect(built.map((b) => b.slug)).toEqual([
      'email-triage-draft',
      'whatsapp-control',
      'email-learning-engine',
    ]);
    // Keine ungefüllten Slots in KEINEM Workflow.
    for (const b of built) {
      expect(JSON.stringify(b.workflow)).not.toMatch(/\{\{\s*[A-Z0-9_]+\s*\}\}/);
    }
    // Triage bettet Projekt-ID + App-URL ein (Learning holt project_id zur Laufzeit aus dem Webhook).
    const triageRaw = JSON.stringify(built.find((b) => b.slug === 'email-triage-draft')!.workflow);
    expect(triageRaw).toContain('https://www.axantilo.com');
    expect(triageRaw).toContain('712db8db-bd73-4392-915e-e9fa1a4ea744');
  });

  it('gives each project unique webhook paths (no collisions between users)', async () => {
    const control = (await buildEmailAutomation(supabaseWithMailCred(null), { ...BASE_ARGS, mailProvider: 'gmail' }))
      .find((b) => b.slug === 'whatsapp-control')!;
    const raw = JSON.stringify(control.workflow);
    expect(raw).toContain('wa-712db8db');            // control webhook path
    expect(raw).toContain('learn-712db8db');         // learning webhook (from send route)
  });

  it('binds central credentials to http/twilio and the mail credential when connected', async () => {
    const triage = (await buildEmailAutomation(supabaseWithMailCred('gmailcred-9'), { ...BASE_ARGS, mailProvider: 'gmail' }))
      .find((b) => b.slug === 'email-triage-draft')!;
    const byName = Object.fromEntries(triage.workflow.nodes.map((n) => [n.name, n]));

    // App-HTTP-Node → Header-Auth-Credential.
    expect((byName['KI: Kategorisieren'].credentials as Record<string, { id: string }>).httpHeaderAuth.id).toBe('wtok-1');
    // Gmail-Trigger → das verbundene Mail-Konto des Users.
    expect((byName['Neue E-Mail'].credentials as Record<string, { id: string }>).gmailOAuth2.id).toBe('gmailcred-9');
    // Twilio → zentrale Credential.
    expect((byName['WhatsApp: Entwurf zur Freigabe'].credentials as Record<string, { id: string }>).twilioApi.id).toBe('tw-1');
    // Kalender: verbunden → Node aktiviert + Credential gebunden.
    expect(byName['Kalender lesen'].disabled).toBe(false);
    expect((byName['Kalender lesen'].credentials as Record<string, { id: string }>).googleCalendarOAuth2Api.id).toBe('gmailcred-9');
  });

  it('keeps the calendar node disabled when no calendar credential exists', async () => {
    const triage = (await buildEmailAutomation(supabaseWithMailCred(null), { ...BASE_ARGS, mailProvider: 'gmail' }))
      .find((b) => b.slug === 'email-triage-draft')!;
    const cal = triage.workflow.nodes.find((n) => n.name === 'Kalender lesen')!;
    expect(cal.disabled).toBe(true);
    expect(cal.credentials).toBeUndefined();
  });

  it('leaves the mail node without a credential when the user has not connected yet', async () => {
    const triage = (await buildEmailAutomation(supabaseWithMailCred(null), { ...BASE_ARGS, mailProvider: 'outlook' }))
      .find((b) => b.slug === 'email-triage-draft')!;
    const trigger = triage.workflow.nodes.find((n) => n.name === 'Neue E-Mail')!;
    expect(trigger.type).toBe('n8n-nodes-base.microsoftOutlookTrigger');
    expect(trigger.credentials).toBeUndefined();
  });
});

describe('buildEmailAutomation — draft mode (standalone, default)', () => {
  it('builds ONLY the autopilot workflow (no control channel, no Twilio)', async () => {
    const built = await buildEmailAutomation(supabaseWithMailCred('gmailcred-9'), {
      ...BASE_ARGS,
      mailProvider: 'gmail',
      approvalMode: 'draft',
    });
    expect(built).toHaveLength(1);
    expect(built[0].slug).toBe('email-autopilot');
    const raw = JSON.stringify(built[0].workflow);
    // Eigenständig: keine Twilio-/Pending-/Steuerkanal-Abhängigkeit, keine offenen Slots.
    expect(raw).not.toMatch(/\{\{\s*[A-Z0-9_]+\s*\}\}/);
    expect(raw).not.toContain('twilio');
    expect(raw).not.toContain('/api/agent/pending');
    // Der Entwurf landet als Gmail-Draft im Postfach.
    const draftNode = built[0].workflow.nodes.find((n) => n.name === 'Entwurf im Postfach')!;
    expect((draftNode.parameters as { resource: string; operation: string }).resource).toBe('draft');
    expect((draftNode.parameters as { operation: string }).operation).toBe('create');
  });

  it('is the default when no approvalMode is given', async () => {
    const built = await buildEmailAutomation(supabaseWithMailCred(null), {
      userId: 'u1',
      projectId: '712db8db-bd73-4392-915e-e9fa1a4ea744',
      mailProvider: 'gmail',
      personaPath: 'rules/persona_thomas.md',
      appBaseUrl: 'https://www.axantilo.com',
    });
    expect(built.map((b) => b.slug)).toEqual(['email-autopilot']);
  });
});

describe('deployEmailAutomation (MOCK_N8N)', () => {
  beforeEach(() => {
    process.env.MOCK_N8N = 'true';
  });

  it('creates + records all three workflows for a fresh user', async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const supabase = {
      from: (table: string) => {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          // user_credentials + workflows-Existenzprüfung → nichts vorhanden.
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          insert: (row: Record<string, unknown>) => {
            if (table === 'workflows') inserts.push(row);
            return Promise.resolve({ data: null, error: null });
          },
        };
        return builder;
      },
    } as unknown as SupabaseClient;

    const out = await deployEmailAutomation(supabase, { ...BASE_ARGS, mailProvider: 'gmail' });
    expect(out.ok).toBe(true);
    expect(out.workflows).toHaveLength(3);
    // Ohne verbundenes Postfach: angelegt (mock id) aber inaktiv.
    expect(out.workflows.every((w) => w.n8nId.startsWith('mock_wf_') && !w.active)).toBe(true);
    expect(out.mailConnected).toBe(false);
    expect(inserts.every((r) => r.status === 'inactive')).toBe(true);
    // Jeder neue Workflow wird in der workflows-Tabelle verbucht.
    expect(inserts).toHaveLength(3);
    expect(inserts.every((r) => r.project_id === BASE_ARGS.projectId)).toBe(true);
  });
});
