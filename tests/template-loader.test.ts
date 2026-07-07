import { describe, expect, it } from 'vitest';
import {
  applySlots,
  loadWorkflowTemplate,
  MAIL_PROVIDER_NODES,
  type N8nWorkflowJson,
} from '@/lib/template-loader';

/** Minimales golden-JSON-Skelett mit einem Trigger-, Send- und einem Skalar-Slot. */
function fixture(): N8nWorkflowJson {
  return {
    name: 'AXANTILO: Email Triage & Draft',
    nodes: [
      { name: 'Mail rein', type: '{{TRIGGER_NODE}}' },
      {
        name: 'Kategorisieren',
        type: '@n8n/n8n-nodes-langchain.textClassifier',
        parameters: { categories: '{{KATEGORIEN}}' },
      },
      {
        name: 'Entwurf senden',
        type: '{{SEND_NODE}}',
        parameters: { subject: 'Antwort von {{ABSENDER_NAME}}' },
      },
    ],
    connections: {},
  };
}

describe('applySlots', () => {
  it('resolves provider node slots and fills scalar slots', () => {
    const { workflow, credentialBindings } = applySlots(fixture(), {
      mailProvider: 'gmail',
      scalars: { KATEGORIEN: 'Spam, Lead, Support', ABSENDER_NAME: 'Thomas' },
    });

    const [trigger, classify, send] = workflow.nodes;
    expect(trigger.type).toBe(MAIL_PROVIDER_NODES.gmail.trigger.type);
    expect(trigger.typeVersion).toBe(MAIL_PROVIDER_NODES.gmail.trigger.typeVersion);
    expect(send.type).toBe(MAIL_PROVIDER_NODES.gmail.send.type);
    expect((classify.parameters as { categories: string }).categories).toBe('Spam, Lead, Support');
    expect((send.parameters as { subject: string }).subject).toBe('Antwort von Thomas');

    // Beide Provider-Nodes brauchen eine Credential-Bindung.
    expect(credentialBindings).toEqual([
      { node: 'Mail rein', credentialType: 'gmailOAuth2Api' },
      { node: 'Entwurf senden', credentialType: 'gmailOAuth2Api' },
    ]);
  });

  it('resolves the CRM slot to the chosen provider', () => {
    const tpl: N8nWorkflowJson = {
      nodes: [{ name: 'Kontakt-Lookup', type: '{{CRM_NODE}}' }],
    };
    const { workflow } = applySlots(tpl, { crmProvider: 'pipedrive' });
    expect(workflow.nodes[0].type).toBe('n8n-nodes-base.pipedrive');
  });

  it('does not mutate the input template', () => {
    const tpl = fixture();
    applySlots(tpl, { mailProvider: 'gmail', scalars: { KATEGORIEN: 'x', ABSENDER_NAME: 'y' } });
    expect(tpl.nodes[0].type).toBe('{{TRIGGER_NODE}}');
  });

  it('throws when a structural slot has no provider chosen', () => {
    expect(() => applySlots(fixture(), { scalars: { KATEGORIEN: 'x', ABSENDER_NAME: 'y' } })).toThrow(
      /TRIGGER_NODE/,
    );
  });

  it('throws when a scalar slot is missing', () => {
    expect(() => applySlots(fixture(), { mailProvider: 'gmail', scalars: { KATEGORIEN: 'x' } })).toThrow(
      /ABSENDER_NAME/,
    );
  });
});

describe('loadWorkflowTemplate', () => {
  it('throws a clear error for an unknown slug', () => {
    expect(() => loadWorkflowTemplate('does-not-exist', { mailProvider: 'gmail' })).toThrow(
      /nicht gefunden/,
    );
  });
});
