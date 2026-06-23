import { describe, it, expect } from 'vitest';
import {
  suggestParametersForStep,
  isCoachingIntent,
  buildSetupGuides,
  formatCoachMessage,
  nextOpenStepId,
} from '@/lib/workflow-setup-coach';
import type { Workflow, WorkflowStep } from '@/lib/types';

const workflow: Workflow = {
  id: 'wf_test',
  title: 'Angebot automatisch',
  linked_pain_point: 'Manuelle Angebotserstellung',
  steps: [
    { id: 's1', label: 'Start', type: 'trigger', n8nType: 'n8n-nodes-base.webhook', note: 'Formular sendet Lead' },
    { id: 's2', label: 'CRM lesen', type: 'action', n8nType: 'n8n-nodes-base.airtable', note: 'Kundendaten holen' },
    { id: 's3', label: 'Mail senden', type: 'action', n8nType: 'n8n-nodes-base.gmail', note: 'Angebot verschicken' },
  ],
};

describe('suggestParametersForStep', () => {
  it('schlägt Webhook POST + Pfad vor', () => {
    const step = workflow.steps[0];
    const p = suggestParametersForStep(step, workflow);
    expect(p.httpMethod).toBe('POST');
    expect(String(p.path)).toMatch(/^axantilo-/);
    expect(p.responseMode).toBe('onReceived');
  });

  it('schlägt Gmail send vor', () => {
    const p = suggestParametersForStep(workflow.steps[2], workflow);
    expect(p.operation).toBe('send');
    expect(p.resource).toBe('message');
  });
});

describe('isCoachingIntent', () => {
  it('erkennt Webhook-Fragen', () => {
    expect(isCoachingIntent('Wie richte ich den Webhook ein?')).toBe(true);
    expect(isCoachingIntent('Schritt 2 soll Slack sein')).toBe(false);
  });
});

describe('buildSetupGuides', () => {
  it('markiert ersten Schritt mit fehlendem Credential als next', () => {
    const wf: Workflow = {
      ...workflow,
      steps: [
        { id: 's1', label: 'Mail', type: 'action', n8nType: 'n8n-nodes-base.gmail', credentialType: 'gmailOAuth2' },
      ],
    };
    const guides = buildSetupGuides(wf, {});
    expect(guides[0].status).toBe('next');
    expect(guides[0].instructions).toContain('Gmail');
    expect(nextOpenStepId(guides)).toBe('s1');
  });
});

describe('formatCoachMessage', () => {
  it('enthält Fortschritt und nächsten Schritt', () => {
    const wf: Workflow = {
      ...workflow,
      steps: [
        { id: 's1', label: 'Mail', type: 'action', n8nType: 'n8n-nodes-base.gmail', credentialType: 'gmailOAuth2' },
      ],
    };
    const guides = buildSetupGuides(wf, {});
    const msg = formatCoachMessage(wf, guides, 'Los geht\'s:');
    expect(msg).toContain('Los geht\'s:');
    expect(msg).toContain('Manuelle Angebotserstellung');
    expect(msg).toContain('Fortschritt:');
    expect(msg).toContain('Schritt 1');
  });
});
