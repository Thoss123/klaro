import { describe, expect, it } from 'vitest';
import { loadWorkflowTemplate } from '@/lib/template-loader';

/**
 * Golden-Template-Test für den Angebots-Autopiloten (Anfrage rein, Angebot raus).
 * Prüft: Slots werden vollständig gefüllt (Mail-Provider-Swap für Trigger + Send), die
 * KI-Extraktion (offer/extract) und der Angebotsentwurf (offer/draft) laufen über den
 * zentralen LLM-Proxy, die Preisliste kommt aus der Datenablage, die Freigabe läuft über
 * agent_pending_actions (Human-in-the-Loop), und der Trigger ist der erste Node.
 */

const COMMON = {
  APP_BASE_URL: 'https://www.axantilo.com',
  PROJECT_ID: 'p-123',
  PERSONA_PATH: 'rules/persona_thomas.md',
  PREISLISTE_TABLE: 'preisliste',
  FOLLOWUP_TABLE: 'followup_leads',
  OWNER_WHATSAPP: '+491234567',
  TWILIO_WHATSAPP_FROM: '+14155238886',
  OFFER_APPROVAL_WEBHOOK_PATH: 'offer-approval-x',
};

describe('angebot-autopilot template (golden)', () => {
  it('fills all slots for gmail with no leftovers', () => {
    const { workflow, credentialBindings } = loadWorkflowTemplate('angebot-autopilot', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });

    const raw = JSON.stringify(workflow);
    expect(raw).not.toMatch(/\{\{\s*[A-Z0-9_]+\s*\}\}/);
    expect(raw).toContain('https://www.axantilo.com');
    expect(raw).toContain('p-123');
    expect(raw).toContain('preisliste');
    expect(raw).toContain('followup_leads');
    expect(raw).toContain('offer-approval-x');

    // Trigger + Send sind provider-swappable wie followup-serie/email-triage-draft.
    const trigger = workflow.nodes.find((n) => n.name === 'Neue Anfrage')!;
    expect(trigger.type).toBe('n8n-nodes-base.gmailTrigger');
    const sendNode = workflow.nodes.find((n) => n.name === 'Angebot senden')!;
    expect(sendNode.type).toBe('n8n-nodes-base.gmail');
    expect(credentialBindings).toEqual(
      expect.arrayContaining([
        { node: 'Neue Anfrage', credentialType: 'gmailOAuth2' },
        { node: 'Angebot senden', credentialType: 'gmailOAuth2' },
      ]),
    );
  });

  it('resolves outlook as an alternative provider', () => {
    const { workflow } = loadWorkflowTemplate('angebot-autopilot', {
      mailProvider: 'outlook',
      scalars: COMMON,
    });
    expect(workflow.nodes.find((n) => n.name === 'Neue Anfrage')?.type).toBe(
      'n8n-nodes-base.microsoftOutlookTrigger',
    );
    expect(workflow.nodes.find((n) => n.name === 'Angebot senden')?.type).toBe(
      'n8n-nodes-base.microsoftOutlook',
    );
  });

  it('starts with the trigger node', () => {
    const { workflow } = loadWorkflowTemplate('angebot-autopilot', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });
    expect(workflow.nodes[0].name).toBe('Neue Anfrage');
    expect(workflow.nodes[0].type).toBe('n8n-nodes-base.gmailTrigger');
  });

  it('extracts request data via the central LLM proxy (offer/extract)', () => {
    const { workflow } = loadWorkflowTemplate('angebot-autopilot', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });
    const extractNode = workflow.nodes.find((n) => n.name === 'KI: Anfrage extrahieren')!;
    expect((extractNode.parameters as { url: string }).url).toContain('/api/agent/llm');
    const body = (extractNode.parameters as { jsonBody: string }).jsonBody;
    expect(body).toContain("prompt_key: 'offer/extract'");
    expect(body).not.toContain('lmChatMistralCloud');
  });

  it('drafts the offer via the central LLM proxy with the preisliste variable (offer/draft)', () => {
    const { workflow } = loadWorkflowTemplate('angebot-autopilot', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });
    const draftNode = workflow.nodes.find((n) => n.name === 'KI: Angebot entwerfen')!;
    expect((draftNode.parameters as { url: string }).url).toContain('/api/agent/llm');
    const body = (draftNode.parameters as { jsonBody: string }).jsonBody;
    expect(body).toContain("prompt_key: 'offer/draft'");
    expect(body).toContain('preisliste');
    expect(body).not.toContain('lmChatMistralCloud');
  });

  it('looks up prices from the Datenablage-API before drafting', () => {
    const { workflow } = loadWorkflowTemplate('angebot-autopilot', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });
    const priceNode = workflow.nodes.find((n) => n.name === 'Preisliste lesen')!;
    expect((priceNode.parameters as { url: string }).url).toContain('/api/agent/data');
    const body = (priceNode.parameters as { jsonBody: string }).jsonBody;
    expect(body).toContain("op: 'select'");
    expect(body).toContain('preisliste');
  });

  it('creates a pending approval action before sending (human-in-the-loop)', () => {
    const { workflow } = loadWorkflowTemplate('angebot-autopilot', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });
    const pendingNode = workflow.nodes.find((n) => n.name === 'Freigabe anlegen')!;
    expect((pendingNode.parameters as { url: string }).url).toContain('/api/agent/pending');
    const body = (pendingNode.parameters as { jsonBody: string }).jsonBody;
    expect(body).toContain('offer_approval');
    expect(body).toContain('draft:');
  });

  it('has a dedicated approval webhook that resolves send vs. revise', () => {
    const { workflow } = loadWorkflowTemplate('angebot-autopilot', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });
    const webhookNode = workflow.nodes.find((n) => n.name === 'Freigabe-Antwort (WhatsApp)')!;
    expect(webhookNode.type).toBe('n8n-nodes-base.webhook');
    expect((webhookNode.parameters as { path: string }).path).toBe('offer-approval-x');

    const conn = workflow.connections as Record<string, { main: Array<Array<{ node: string }>> }>;
    const ifNode = conn['Freigegeben?'];
    expect(ifNode.main[0][0].node).toBe('Angebot senden');
    expect(ifNode.main[1][0].node).toBe('KI: Angebot überarbeiten');
  });

  it('marks the offer as sent (offer_sent_at) after approval, feeding the follow-up serie', () => {
    const { workflow } = loadWorkflowTemplate('angebot-autopilot', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });
    const markNode = workflow.nodes.find((n) => n.name === 'Angebot als versendet markieren')!;
    expect((markNode.parameters as { url: string }).url).toContain('/api/agent/data');
    const body = (markNode.parameters as { jsonBody: string }).jsonBody;
    expect(body).toContain("op: 'update'");
    expect(body).toContain('offer_sent_at');
  });

  it('wires the main chain: trigger -> extract -> parse -> price lookup -> draft -> save -> pending -> notify', () => {
    const { workflow } = loadWorkflowTemplate('angebot-autopilot', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });
    const conn = workflow.connections as Record<string, { main: Array<Array<{ node: string }>> }>;
    expect(conn['Neue Anfrage'].main[0][0].node).toBe('KI: Anfrage extrahieren');
    expect(conn['KI: Anfrage extrahieren'].main[0][0].node).toBe('Extraktion parsen');
    expect(conn['Extraktion parsen'].main[0][0].node).toBe('Preisliste lesen');
    expect(conn['Preisliste lesen'].main[0][0].node).toBe('Preisliste zusammenfassen');
    expect(conn['Preisliste zusammenfassen'].main[0][0].node).toBe('KI: Angebot entwerfen');
    expect(conn['KI: Angebot entwerfen'].main[0][0].node).toBe('Anfrage in Datenablage speichern');
    expect(conn['Anfrage in Datenablage speichern'].main[0][0].node).toBe('Freigabe anlegen');
    expect(conn['Freigabe anlegen'].main[0][0].node).toBe('WhatsApp: Angebot zur Freigabe');
  });
});
