import { describe, expect, it } from 'vitest';
import { loadWorkflowTemplate } from '@/lib/template-loader';

const SCALARS = {
  APP_BASE_URL: 'https://app.axantilo.com',
  PROJECT_ID: 'p-123',
  PERSONA_PATH: 'rules/persona_thomas.md',
  OWNER_WHATSAPP: '+491234567',
};

describe('email-triage-draft template', () => {
  it('loads and fills all slots for the gmail provider', () => {
    const { workflow, credentialBindings } = loadWorkflowTemplate('email-triage-draft', {
      mailProvider: 'gmail',
      scalars: SCALARS,
    });

    // Trigger-Slot ist auf den Gmail-Trigger aufgelöst.
    const trigger = workflow.nodes.find((n) => n.name === 'Neue E-Mail');
    expect(trigger?.type).toBe('n8n-nodes-base.gmailTrigger');

    // Provider-Node braucht eine Credential-Bindung.
    expect(credentialBindings).toEqual([{ node: 'Neue E-Mail', credentialType: 'gmailOAuth2Api' }]);

    // Der AI-Agent hat ein Chat Model als ai_languageModel-Sub-Node.
    expect(workflow.connections?.['Chat Model']).toMatchObject({
      ai_languageModel: [[{ node: 'Entwurf schreiben', type: 'ai_languageModel' }]],
    });

    // Keine ungefüllten Slots mehr im gesamten JSON (n8n-Expressions bleiben erhalten).
    const raw = JSON.stringify(workflow);
    expect(raw).not.toMatch(/\{\{\s*[A-Z0-9_]+\s*\}\}/);
    expect(raw).toContain('https://app.axantilo.com/api/agent/pending');
    expect(raw).toContain('whatsapp:+491234567');
    // n8n-Expression-Syntax darf NICHT ersetzt worden sein.
    expect(raw).toContain('$json.systemPrompt');
  });

  it('resolves outlook as an alternative provider', () => {
    const { workflow } = loadWorkflowTemplate('email-triage-draft', {
      mailProvider: 'outlook',
      scalars: SCALARS,
    });
    const trigger = workflow.nodes.find((n) => n.name === 'Neue E-Mail');
    expect(trigger?.type).toBe('n8n-nodes-base.microsoftOutlookTrigger');
  });
});
