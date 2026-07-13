import { describe, expect, it } from 'vitest';
import { loadWorkflowTemplate } from '@/lib/template-loader';

/**
 * Golden-Template-Tests für die drei Agenten-Workflows.
 * Die goldens sind Exporte der LIVE-getesteten n8n-Workflows mit Slots —
 * hier wird geprüft, dass der Loader sie vollständig füllen kann und die
 * Kern-Struktur (LLM-API-Aufrufe, Verdrahtung) intakt ist.
 */

const COMMON = {
  APP_BASE_URL: 'https://www.axantilo.com',
  PROJECT_ID: 'p-123',
  PERSONA_PATH: 'rules/persona_thomas.md',
  OWNER_WHATSAPP: '+491234567',
  TWILIO_WHATSAPP_FROM: '+14155238886',
  EMAIL_SEND_WEBHOOK_PATH: 'email-send-test',
};

describe('email-triage-draft template (golden)', () => {
  it('fills all slots for gmail and routes all 8 categories specifically', () => {
    const { workflow, credentialBindings } = loadWorkflowTemplate('email-triage-draft', {
      mailProvider: 'gmail',
      scalars: COMMON,
    });

    const trigger = workflow.nodes.find((n) => n.name === 'Neue E-Mail');
    expect(trigger?.type).toBe('n8n-nodes-base.gmailTrigger');
    // Trigger + Postfach-Aufräum-Nodes (markAsRead/Archiv) brauchen Provider-Credentials.
    expect(credentialBindings).toEqual(
      expect.arrayContaining([{ node: 'Neue E-Mail', credentialType: 'gmailOAuth2Api' }]),
    );

    const raw = JSON.stringify(workflow);
    // Keine ungefüllten Slots; n8n-Expressions ({{ $json… }}) bleiben unberührt.
    expect(raw).not.toMatch(/\{\{\s*[A-Z0-9_]+\s*\}\}/);
    // KI läuft über die zentrale LLM-API (Credits + anpassbare Prompts) — keine Mistral-Nodes.
    expect(raw).toContain('https://www.axantilo.com/api/agent/llm');
    expect(raw).toContain("prompt_key: 'email/classify'");
    expect(raw).not.toContain('lmChatMistralCloud');

    // 8 Kategorien → spezifische Wege:
    const sw = workflow.connections?.['Switch'] as { main: Array<Array<{ node: string }>> };
    expect(sw.main[0][0].node).toBe('KI: Entwurf schreiben');   // lead_inquiry
    expect(sw.main[1][0].node).toBe('Kalender lesen');           // scheduling → Kalender-Kontext
    expect(sw.main[2][0].node).toBe('KI: Entwurf schreiben');   // support_faq (inkl. Storno/Kundenrechnung)
    expect(sw.main[3][0].node).toBe('KI: Rechnungs-Info');      // vendor_billing → Kurzinfo, kein Entwurf
    expect(sw.main[4][0].node).toBe('Wichtig?');                 // system_alerts → nur high stört
    expect(sw.main[5][0].node).toBe('Als gelesen markieren');   // newsletters → aufräumen
    expect(sw.main[6][0].node).toBe('Als gelesen markieren');   // spam_marketing → aufräumen
    expect(sw.main[7][0].node).toBe('KI: Entwurf schreiben');   // other

    // Termin-Route endet wie die anderen Entwurf-Wege in der Freigabe.
    expect((workflow.connections?.['KI: Termin-Entwurf'] as { main: Array<Array<{ node: string }>> }).main[0][0].node).toBe('Bernd: Freigabe anfragen');
    // Kalender-Node ist disabled ausgeliefert (User verbindet Calendar, dann 1 Klick).
    expect(workflow.nodes.find((n) => n.name === 'Kalender lesen')?.disabled).toBe(true);

    // Freigabe, Versand und Revision laufen vollständig über Telegram-HITL.
    expect(raw).toContain('/api/bernd/hitl-request');
    expect(raw).toContain('/api/bernd/notify');
    expect(raw).toContain('email-send-test');
    expect(raw).toContain('Revisions-Kontext bauen');
    expect(raw).not.toContain('n8n-nodes-base.twilio');
    expect(raw).not.toContain('OWNER_WHATSAPP');
  });

  it('resolves outlook as an alternative provider', () => {
    const { workflow } = loadWorkflowTemplate('email-triage-draft', {
      mailProvider: 'outlook',
      scalars: COMMON,
    });
    expect(workflow.nodes.find((n) => n.name === 'Neue E-Mail')?.type).toBe(
      'n8n-nodes-base.microsoftOutlookTrigger',
    );
  });
});

describe('whatsapp-control template (golden)', () => {
  const SCALARS = {
    ...COMMON,
    CONTROL_WEBHOOK_PATH: 'whatsapp-inbound-x',
    LEARNING_WEBHOOK_URL: 'https://n8n.example.com/webhook/learning-x',
  };

  it('fills all slots and wires the three routes', () => {
    const { workflow } = loadWorkflowTemplate('whatsapp-control', {
      mailProvider: 'gmail',
      scalars: SCALARS,
    });
    expect(JSON.stringify(workflow)).not.toMatch(/\{\{\s*[A-Z0-9_]+\s*\}\}/);

    const route = workflow.connections?.['Route'] as { main: Array<Array<{ node: string }>> };
    expect(route.main[0][0].node).toBe('E-Mail senden'); // send
    expect(route.main[1][0].node).toBe('KI: Entwurf überarbeiten'); // revise
    expect(route.main[2][0].node).toBe('KI: Assistent'); // adhoc

    // Send-Pfad stößt die Learning Engine an.
    expect(JSON.stringify(workflow)).toContain('https://n8n.example.com/webhook/learning-x');
    // Send-Node ist provider-swappable.
    expect(workflow.nodes.find((n) => n.name === 'E-Mail senden')?.type).toBe('n8n-nodes-base.gmail');
  });
});

describe('email-learning-engine template (golden)', () => {
  it('fills scalar slots and writes both rule files conditionally', () => {
    const { workflow } = loadWorkflowTemplate('email-learning-engine', {
      scalars: { APP_BASE_URL: 'https://www.axantilo.com', LEARNING_WEBHOOK_PATH: 'learn-x' },
    });
    const raw = JSON.stringify(workflow);
    expect(raw).not.toMatch(/\{\{\s*[A-Z0-9_]+\s*\}\}/);
    expect(raw).toContain("prompt_key: 'email/learn'");
    expect(workflow.nodes.map((n) => n.name)).toEqual(
      expect.arrayContaining(['Firmenwissen aktualisieren', 'Persona aktualisieren']),
    );
  });
});
