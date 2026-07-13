import { describe, expect, it } from 'vitest';
import { loadWorkflowTemplate } from '@/lib/template-loader';

/**
 * Golden-Template-Test für die Lead-Follow-up-Serie (T3/T7/T14).
 * Prüft: Slots werden vollständig gefüllt, der Trigger ist ein scheduleTrigger (kein
 * Parallel-Wait pro Lead), die Datenablage-API wird für select+update angesprochen, und die
 * KI läuft über den zentralen LLM-Proxy statt eigener Mistral-Nodes.
 */

const COMMON = {
  APP_BASE_URL: 'https://www.axantilo.com',
  PROJECT_ID: 'p-123',
  PERSONA_PATH: 'rules/persona_thomas.md',
  FOLLOWUP_TABLE: 'followup_leads',
};

describe('followup-serie template (golden)', () => {
  it('fills all slots for gmail with no leftovers', () => {
    const { workflow, credentialBindings } = loadWorkflowTemplate('followup-serie', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });

    const raw = JSON.stringify(workflow);
    expect(raw).not.toMatch(/\{\{\s*[A-Z0-9_]+\s*\}\}/);
    expect(raw).toContain('https://www.axantilo.com');
    expect(raw).toContain('p-123');
    expect(raw).toContain('followup_leads');

    // Send-Node ist provider-swappable (wie email-triage-draft).
    const sendNode = workflow.nodes.find((n) => n.name === 'Nachfass-Mail senden')!;
    expect(sendNode.type).toBe('n8n-nodes-base.gmail');
    expect(credentialBindings).toEqual(
      expect.arrayContaining([{ node: 'Nachfass-Mail senden', credentialType: 'gmailOAuth2' }]),
    );
  });

  it('resolves outlook as an alternative provider', () => {
    const { workflow } = loadWorkflowTemplate('followup-serie', {
      mailProvider: 'outlook',
      scalars: COMMON,
    });
    expect(workflow.nodes.find((n) => n.name === 'Nachfass-Mail senden')?.type).toBe(
      'n8n-nodes-base.microsoftOutlook',
    );
  });

  it('triggers on a schedule, never on a per-lead Wait node', () => {
    const { workflow } = loadWorkflowTemplate('followup-serie', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });
    const trigger = workflow.nodes[0];
    expect(trigger.type).toBe('n8n-nodes-base.scheduleTrigger');
    expect(workflow.nodes.some((n) => n.type === 'n8n-nodes-base.wait')).toBe(false);
  });

  it('reads due leads and writes back stage progress via the Datenablage-API', () => {
    const { workflow } = loadWorkflowTemplate('followup-serie', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });
    const byName = Object.fromEntries(workflow.nodes.map((n) => [n.name, n]));

    const readNode = byName['Datenablage: Leads lesen'];
    expect(readNode.type).toBe('n8n-nodes-base.httpRequest');
    expect((readNode.parameters as { url: string }).url).toContain('/api/agent/data');
    const readBody = (readNode.parameters as { jsonBody: string }).jsonBody;
    expect(readBody).toContain("op: 'select'");

    const updateNode = byName['Datenablage: Stage aktualisieren'];
    expect((updateNode.parameters as { url: string }).url).toContain('/api/agent/data');
    const updateBody = (updateNode.parameters as { jsonBody: string }).jsonBody;
    expect(updateBody).toContain("op: 'update'");
    expect(updateBody).toContain('followup_stage');
  });

  it('drafts via the central LLM proxy with the followup/draft_stage prompt', () => {
    const { workflow } = loadWorkflowTemplate('followup-serie', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });
    const llmNode = workflow.nodes.find((n) => n.name === 'KI: Nachfass-Entwurf')!;
    expect((llmNode.parameters as { url: string }).url).toContain('/api/agent/llm');
    const body = (llmNode.parameters as { jsonBody: string }).jsonBody;
    expect(body).toContain("prompt_key: 'followup/draft_stage'");
    expect(body).not.toContain('lmChatMistralCloud');
  });

  it('computes T3/T7/T14 stages and skips leads without offer_sent_at', () => {
    const { workflow } = loadWorkflowTemplate('followup-serie', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });
    const codeNode = workflow.nodes.find((n) => n.name === 'Fällige Stage berechnen')!;
    const code = (codeNode.parameters as { jsCode: string }).jsCode;
    expect(code).toContain('T3');
    expect(code).toContain('T7');
    expect(code).toContain('T14');
    expect(code).toContain('offer_sent_at');
    expect(code).toContain("status === 'done'");
  });

  it('wires the chain linearly: trigger -> read -> compute -> draft -> send -> update', () => {
    const { workflow } = loadWorkflowTemplate('followup-serie', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });
    const conn = workflow.connections as Record<string, { main: Array<Array<{ node: string }>> }>;
    expect(conn['Täglich'].main[0][0].node).toBe('Datenablage: Leads lesen');
    expect(conn['Datenablage: Leads lesen'].main[0][0].node).toBe('Fällige Stage berechnen');
    expect(conn['Fällige Stage berechnen'].main[0][0].node).toBe('KI: Nachfass-Entwurf');
    expect(conn['KI: Nachfass-Entwurf'].main[0][0].node).toBe('Nachfass-Mail senden');
    expect(conn['Nachfass-Mail senden'].main[0][0].node).toBe('Datenablage: Stage aktualisieren');
  });
});
