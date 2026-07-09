import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildTemplateWorkflow, deployTemplateWorkflow } from '@/lib/template-deploy';

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
  process.env.N8N_API_URL = 'https://n8n.example.com/api/v1';
});
afterEach(() => {
  process.env = { ...ENV_BACKUP };
});

const BASE_ARGS = {
  slug: 'followup-serie',
  userId: 'u1',
  projectId: '712db8db-bd73-4392-915e-e9fa1a4ea744',
  appBaseUrl: 'https://www.axantilo.com',
  mailProvider: 'gmail' as const,
  scalars: { PERSONA_PATH: 'rules/persona_thomas.md', FOLLOWUP_TABLE: 'followup_leads' },
};

describe('buildTemplateWorkflow', () => {
  it('fills slots and binds the central header-auth + mail credentials', async () => {
    const built = await buildTemplateWorkflow(supabaseWithMailCred('gmailcred-9'), BASE_ARGS);
    expect(built.slug).toBe('followup-serie');
    const raw = JSON.stringify(built.workflow);
    expect(raw).not.toMatch(/\{\{\s*[A-Z0-9_]+\s*\}\}/);

    const byName = Object.fromEntries(built.workflow.nodes.map((n) => [n.name, n]));
    // App-HTTP-Nodes -> zentrale Header-Auth-Credential.
    expect((byName['Datenablage: Leads lesen'].credentials as Record<string, { id: string }>).httpHeaderAuth.id).toBe('wtok-1');
    expect((byName['KI: Nachfass-Entwurf'].credentials as Record<string, { id: string }>).httpHeaderAuth.id).toBe('wtok-1');
    // Send-Node -> das verbundene Mail-Konto des Users.
    expect((byName['Nachfass-Mail senden'].credentials as Record<string, { id: string }>).gmailOAuth2.id).toBe('gmailcred-9');
  });

  it('leaves the mail node without a credential when not connected yet', async () => {
    const built = await buildTemplateWorkflow(supabaseWithMailCred(null), BASE_ARGS);
    const sendNode = built.workflow.nodes.find((n) => n.name === 'Nachfass-Mail senden')!;
    expect(sendNode.credentials).toBeUndefined();
  });

  it('respects a custom name override', async () => {
    const built = await buildTemplateWorkflow(supabaseWithMailCred('gmailcred-9'), {
      ...BASE_ARGS,
      name: 'AXANTILO: Custom Name',
    });
    expect(built.name).toBe('AXANTILO: Custom Name');
  });
});

describe('deployTemplateWorkflow (MOCK_N8N)', () => {
  beforeEach(() => {
    process.env.MOCK_N8N = 'true';
  });

  it('creates + records a new workflow, inactive until mailbox connected', async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const supabase = {
      from: (table: string) => {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          insert: (row: Record<string, unknown>) => {
            if (table === 'workflows') inserts.push(row);
            return Promise.resolve({ data: null, error: null });
          },
        };
        return builder;
      },
    } as unknown as SupabaseClient;

    const out = await deployTemplateWorkflow(supabase, BASE_ARGS);
    expect(out.ok).toBe(true);
    expect(out.n8nId.startsWith('mock_wf_')).toBe(true);
    expect(out.active).toBe(false);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].status).toBe('inactive');
    expect(inserts[0].project_id).toBe(BASE_ARGS.projectId);
  });

  it('is idempotent: a second deploy for the same project updates instead of duplicating', async () => {
    const inserts: Array<Record<string, unknown>> = [];
    let existingId: string | null = null;
    const supabase = {
      from: (table: string) => {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: () =>
            Promise.resolve({
              data: table === 'workflows' && existingId ? { n8n_workflow_id: existingId } : null,
              error: null,
            }),
          insert: (row: Record<string, unknown>) => {
            if (table === 'workflows') {
              inserts.push(row);
              existingId = row.n8n_workflow_id as string;
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return builder;
      },
    } as unknown as SupabaseClient;

    const first = await deployTemplateWorkflow(supabase, BASE_ARGS);
    const second = await deployTemplateWorkflow(supabase, BASE_ARGS);
    expect(inserts).toHaveLength(1); // kein zweiter Insert
    expect(second.n8nId).toBe(first.n8nId);
  });
});
