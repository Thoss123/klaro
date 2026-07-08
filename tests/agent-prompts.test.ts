import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AGENT_PROMPTS,
  getAgentPromptDef,
  promptOverridePath,
  resolveAgentPrompt,
  resolveModel,
} from '@/lib/agent-prompts';

/** Mock-Client: liefert content je nach angefragtem path (eq('path', …)). */
function clientWithFiles(files: Record<string, string>): SupabaseClient {
  const makeBuilder = () => {
    let requestedPath = '';
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, val: string) => {
        if (col === 'path') requestedPath = val;
        return builder;
      },
      maybeSingle: () =>
        Promise.resolve({
          data: requestedPath in files ? { content: files[requestedPath] } : null,
          error: null,
        }),
    };
    return builder;
  };
  return { from: () => makeBuilder() } as unknown as SupabaseClient;
}

describe('AGENT_PROMPTS registry', () => {
  it('has unique keys and non-empty system prompts', () => {
    const keys = AGENT_PROMPTS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of AGENT_PROMPTS) expect(p.system.length).toBeGreaterThan(50);
  });

  it('draft/revise/adhoc prompts embed the rules placeholders', () => {
    for (const key of ['email/draft_lead_inquiry', 'email/revise', 'control/adhoc']) {
      const def = getAgentPromptDef(key)!;
      expect(def.system).toContain('{{firmenwissen}}');
      expect(def.system).toContain('{{persona}}');
    }
  });

  it('classify and learn are JSON-mode', () => {
    expect(getAgentPromptDef('email/classify')!.json).toBe(true);
    expect(getAgentPromptDef('email/learn')!.json).toBe(true);
  });

  it('classify covers all 8 categories incl. the customer-vs-vendor billing split', () => {
    const sys = getAgentPromptDef('email/classify')!.system;
    for (const c of ['lead_inquiry', 'scheduling', 'support_faq', 'vendor_billing', 'system_alerts', 'newsletters', 'spam_marketing', 'other']) {
      expect(sys).toContain(`"${c}"`);
    }
    // Die kritische Abgrenzung muss explizit im Prompt stehen.
    expect(sys).toMatch(/Fragen von KUNDEN zu deren Rechnungen.*support_faq/);
    expect(sys).toContain('Storno');
  });

  it('scheduling prompt embeds the calendar context variable', () => {
    expect(getAgentPromptDef('email/draft_scheduling')!.system).toContain('{{kalender_kontext}}');
  });

  it('vendor billing summary uses the small model (plain text)', () => {
    const def = getAgentPromptDef('email/summarize_vendor_billing')!;
    expect(def.model).toBe('mistral-small-latest');
    expect(def.json).toBeUndefined();
  });
});

describe('resolveAgentPrompt', () => {
  it('injects workspace rules into the default prompt', async () => {
    const client = clientWithFiles({
      'rules/company_base.md': 'Öffnungszeiten Mo-Fr 9-17',
      'rules/persona_thomas.md': 'Duzt Kunden',
    });
    const r = await resolveAgentPrompt(client, {
      projectId: 'p1',
      key: 'email/draft_support_faq',
      personaPath: 'rules/persona_thomas.md',
    });
    expect(r.system).toContain('Öffnungszeiten Mo-Fr 9-17');
    expect(r.system).toContain('Duzt Kunden');
    expect(r.system).not.toContain('{{firmenwissen}}');
    expect(r.customized).toBe(false);
  });

  it('prefers a workspace override and still injects rules', async () => {
    const client = clientWithFiles({
      [promptOverridePath('email/draft_lead_inquiry')]: 'CUSTOM: {{firmenwissen}} / {{persona}}',
      'rules/company_base.md': 'FAKTEN',
    });
    const r = await resolveAgentPrompt(client, { projectId: 'p1', key: 'email/draft_lead_inquiry' });
    expect(r.system).toBe('CUSTOM: FAKTEN / (keine Persona-Regeln hinterlegt — neutraler, freundlicher Ton)');
    expect(r.customized).toBe(true);
  });

  it('empty override falls back to the default (Standard wiederherstellen)', async () => {
    const client = clientWithFiles({
      [promptOverridePath('email/revise')]: '   ',
    });
    const r = await resolveAgentPrompt(client, { projectId: 'p1', key: 'email/revise' });
    expect(r.customized).toBe(false);
    expect(r.system).toContain('Überarbeite den Entwurf');
  });

  it('throws on unknown keys', async () => {
    const client = clientWithFiles({});
    await expect(resolveAgentPrompt(client, { projectId: 'p1', key: 'nope/nope' })).rejects.toThrow(/Unbekannter/);
  });
});

describe('resolveModel', () => {
  it('classify uses the small model, drafts use the chat default', () => {
    expect(resolveModel(getAgentPromptDef('email/classify')!)).toBe('mistral-small-latest');
    const draftModel = resolveModel(getAgentPromptDef('email/draft_other')!);
    expect(draftModel).toMatch(/mistral/);
  });
});
