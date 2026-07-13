import { describe, expect, it } from 'vitest';
import { loadWorkflowTemplate } from '@/lib/template-loader';

/**
 * Golden-Template-Test für Rechnung & Mahnwesen (zwei Flows in einer JSON).
 * Prüft: Slots vollständig gefüllt; Flow A erzeugt Rechnung über Docs→Drive-PDF→Send→Datenablage;
 * Flow B mahnt über scheduleTrigger + Datenablage-Zustand (kein Parallel-Wait); KI läuft über
 * den zentralen LLM-Proxy statt eigener Mistral-Nodes.
 */

const COMMON = {
  APP_BASE_URL: 'https://www.axantilo.com',
  PROJECT_ID: 'p-123',
  PERSONA_PATH: 'rules/persona_thomas.md',
  INVOICE_TABLE: 'rechnungen',
  INVOICE_DOC_TEMPLATE_ID: 'doc-abc-123',
  ORDER_DONE_WEBHOOK_PATH: 'auftrag-fertig-abcd1234',
};

describe('rechnung-mahnwesen template (golden)', () => {
  it('fills all slots for gmail with no leftovers', () => {
    const { workflow, credentialBindings } = loadWorkflowTemplate('rechnung-mahnwesen', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });

    const raw = JSON.stringify(workflow);
    expect(raw).not.toMatch(/\{\{\s*[A-Z0-9_]+\s*\}\}/);
    expect(raw).toContain('https://www.axantilo.com');
    expect(raw).toContain('doc-abc-123');
    expect(raw).toContain('rechnungen');

    // Beide Send-Nodes sind provider-swappable.
    for (const name of ['Rechnung senden', 'Mahnung senden']) {
      expect(workflow.nodes.find((n) => n.name === name)?.type).toBe('n8n-nodes-base.gmail');
    }
    expect(credentialBindings).toEqual(
      expect.arrayContaining([
        { node: 'Rechnung senden', credentialType: 'gmailOAuth2' },
        { node: 'Mahnung senden', credentialType: 'gmailOAuth2' },
      ]),
    );
  });

  it('resolves outlook as an alternative provider for both send nodes', () => {
    const { workflow } = loadWorkflowTemplate('rechnung-mahnwesen', {
      mailProvider: 'outlook',
      scalars: COMMON,
    });
    for (const name of ['Rechnung senden', 'Mahnung senden']) {
      expect(workflow.nodes.find((n) => n.name === name)?.type).toBe('n8n-nodes-base.microsoftOutlook');
    }
  });

  it('flow A: creates invoice via Docs template -> Drive PDF -> send -> Datenablage insert', () => {
    const { workflow } = loadWorkflowTemplate('rechnung-mahnwesen', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });
    const byName = Object.fromEntries(workflow.nodes.map((n) => [n.name, n]));

    // Trigger ist ein Webhook (Auftrag erledigt), kein Mail-Trigger.
    expect(byName['Auftrag erledigt'].type).toBe('n8n-nodes-base.webhook');

    // Docs/Drive für die PDF-Erzeugung.
    expect(byName['Rechnung aus Vorlage kopieren'].type).toBe('n8n-nodes-base.googleDrive');
    expect(byName['Rechnung befüllen'].type).toBe('n8n-nodes-base.googleDocs');
    const pdfNode = byName['Rechnung als PDF exportieren'];
    expect(pdfNode.type).toBe('n8n-nodes-base.googleDrive');
    expect(JSON.stringify(pdfNode.parameters)).toContain('application/pdf');

    // KI-Formatierung über den LLM-Proxy.
    const draftNode = byName['KI: Rechnungstext formatieren'];
    expect((draftNode.parameters as { url: string }).url).toContain('/api/agent/llm');
    expect((draftNode.parameters as { jsonBody: string }).jsonBody).toContain("prompt_key: 'invoice/draft'");

    // Persistenz in der Datenablage.
    const saveNode = byName['Rechnung in Datenablage speichern'];
    expect((saveNode.parameters as { url: string }).url).toContain('/api/agent/data');
    expect((saveNode.parameters as { jsonBody: string }).jsonBody).toContain("op: 'insert'");
  });

  it('flow B: dunning runs on a schedule with Datenablage state, never a Wait node', () => {
    const { workflow } = loadWorkflowTemplate('rechnung-mahnwesen', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });
    const byName = Object.fromEntries(workflow.nodes.map((n) => [n.name, n]));

    expect(byName['Täglicher Mahnlauf'].type).toBe('n8n-nodes-base.scheduleTrigger');
    expect(workflow.nodes.some((n) => n.type === 'n8n-nodes-base.wait')).toBe(false);

    const readNode = byName['Offene Rechnungen lesen'];
    expect((readNode.parameters as { jsonBody: string }).jsonBody).toContain("op: 'select'");

    const reminderNode = byName['KI: Zahlungserinnerung'];
    expect((reminderNode.parameters as { url: string }).url).toContain('/api/agent/llm');
    expect((reminderNode.parameters as { jsonBody: string }).jsonBody).toContain("prompt_key: 'invoice/reminder'");

    const stageNode = byName['Mahnstufe berechnen'];
    const code = (stageNode.parameters as { jsCode: string }).jsCode;
    expect(code).toContain('mahnstufe');
    expect(code).toContain('daysOverdue');

    const updateNode = byName['Mahnstufe aktualisieren'];
    expect((updateNode.parameters as { jsonBody: string }).jsonBody).toContain("op: 'update'");
  });

  it('has two independent trigger entry points (webhook + schedule)', () => {
    const { workflow } = loadWorkflowTemplate('rechnung-mahnwesen', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });
    const triggers = workflow.nodes.filter(
      (n) => n.type === 'n8n-nodes-base.webhook' || n.type === 'n8n-nodes-base.scheduleTrigger',
    );
    expect(triggers.map((n) => n.name).sort()).toEqual(['Auftrag erledigt', 'Täglicher Mahnlauf']);
  });
});
