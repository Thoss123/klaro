/**
 * Regression tests für die Typ-Präzedenz im NodeResolver (lib/agents/node-resolver.ts).
 *
 * Bug: Keyword-Heuristiken (Entscheidungs-/KI-Regex auf dem Label) haben früher einen
 * expliziten `step.type` überstimmt. Ein `type:"human"`-Freigabe-Schritt mit "Prüfung" im
 * Label landete fälschlich auf einem blanken IF statt dem Freigabe-Kanal, und ein
 * `type:"action"`-Sende-Schritt mit "Zusammenfassung" im Label landete auf einer KI-Chain
 * statt dem Sende-Node. Diese Tests fixieren die korrekte Präzedenz:
 *   step.tool (exakt) > step.type (explizit) > Label-Keywords (nur wenn type fehlt).
 */

import { describe, it, expect } from 'vitest';
import { heuristicResolveStep } from '@/lib/agents/node-resolver';
import type { N8nCatalogIndexEntry } from '@/lib/n8n-catalog-types';

const INDEX: N8nCatalogIndexEntry[] = [
  {
    name: 'n8n-nodes-base.gmail',
    displayName: 'Gmail',
    version: 2,
    groups: ['transform'],
    categories: [],
    aliases: [],
    hasCredentials: true,
    credentialTypes: ['gmailOAuth2'],
    iconPath: null,
    axantiloCategory: 'action',
  },
  {
    name: 'n8n-nodes-base.if',
    displayName: 'If',
    version: 2,
    groups: ['transform'],
    categories: [],
    aliases: [],
    hasCredentials: false,
    credentialTypes: [],
    iconPath: null,
    axantiloCategory: 'flow',
  },
  {
    name: '@n8n/n8n-nodes-langchain.chainSummarization',
    displayName: 'Summarization Chain',
    version: 1,
    groups: ['transform'],
    categories: ['AI'],
    aliases: [],
    hasCredentials: false,
    credentialTypes: [],
    iconPath: null,
    axantiloCategory: 'ai',
  },
  {
    name: '@n8n/n8n-nodes-langchain.chainLlm',
    displayName: 'Basic LLM Chain',
    version: 1,
    groups: ['transform'],
    categories: ['AI'],
    aliases: [],
    hasCredentials: false,
    credentialTypes: [],
    iconPath: null,
    axantiloCategory: 'ai',
  },
  {
    name: '@n8n/n8n-nodes-langchain.openAi',
    displayName: 'OpenAI',
    version: 1,
    groups: ['transform'],
    categories: ['AI'],
    aliases: [],
    hasCredentials: true,
    credentialTypes: ['openAiApi'],
    iconPath: null,
    axantiloCategory: 'ai',
  },
  {
    name: 'n8n-nodes-base.manualTrigger',
    displayName: 'Manual Trigger',
    version: 1,
    groups: ['trigger'],
    categories: [],
    aliases: [],
    hasCredentials: false,
    credentialTypes: [],
    iconPath: null,
    axantiloCategory: 'trigger',
  },
  {
    name: 'n8n-nodes-base.googleCalendarTrigger',
    displayName: 'Google Calendar Trigger',
    version: 1,
    groups: ['trigger'],
    categories: [],
    aliases: [],
    hasCredentials: true,
    credentialTypes: ['googleCalendarOAuth2Api'],
    iconPath: null,
    axantiloCategory: 'trigger',
  },
];

describe('heuristicResolveStep — Typ-Präzedenz vor Keyword-Heuristik', () => {
  it('human-Schritt mit "Prüfung" im Label → Freigabe-Kanal (Gmail), NICHT if', () => {
    const r = heuristicResolveStep(
      { id: 's1', label: 'Angebot zur Prüfung freigeben', type: 'human' },
      INDEX,
    );
    expect(r?.n8n_type).toBe('n8n-nodes-base.gmail');
    expect(r?.n8n_type).not.toBe('n8n-nodes-base.if');
  });

  it('action-Schritt "Zusammenfassung an Inhaber senden" → Sende-Node, NICHT chainSummarization', () => {
    const r = heuristicResolveStep(
      { id: 's2', label: 'Zusammenfassung an Inhaber senden', type: 'action', tool: 'gmail' },
      INDEX,
    );
    expect(r?.n8n_type).toBe('n8n-nodes-base.gmail');
    expect(r?.n8n_type).not.toBe('@n8n/n8n-nodes-langchain.chainSummarization');
  });

  it('action-Schritt "Zusammenfassung an Inhaber senden" OHNE tool → immer noch kein KI-Node (Typ pinnt)', () => {
    const r = heuristicResolveStep(
      { id: 's2b', label: 'Zusammenfassung an Inhaber senden', type: 'action' },
      INDEX,
    );
    expect(r?.n8n_type).not.toBe('@n8n/n8n-nodes-langchain.chainSummarization');
    expect(r?.n8n_type).not.toBe('@n8n/n8n-nodes-langchain.chainLlm');
  });

  it('decision-Schritt "Wenn heißer Lead" → weiterhin if (echte Entscheidung nicht regressieren)', () => {
    const r = heuristicResolveStep(
      { id: 's3', label: 'Wenn heißer Lead', type: 'decision' },
      INDEX,
    );
    expect(r?.n8n_type).toBe('n8n-nodes-base.if');
  });

  it('ai-Schritt "Text zusammenfassen" → weiterhin ein KI-Node', () => {
    const r = heuristicResolveStep(
      { id: 's4', label: 'Text zusammenfassen', type: 'ai' },
      INDEX,
    );
    expect(r?.n8n_type).toContain('chainSummarization');
  });

  it('trigger-Schritt "Nach jedem Termin" → googleCalendarTrigger', () => {
    const r = heuristicResolveStep(
      { id: 's5', label: 'Nach jedem Termin', type: 'trigger' },
      INDEX,
    );
    expect(r?.n8n_type).toBe('n8n-nodes-base.googleCalendarTrigger');
  });

  it('trigger-Schritt "Kalender-Event" → googleCalendarTrigger', () => {
    const r = heuristicResolveStep(
      { id: 's6', label: 'Kalender-Event', type: 'trigger' },
      INDEX,
    );
    expect(r?.n8n_type).toBe('n8n-nodes-base.googleCalendarTrigger');
  });

  it('ohne gesetzten Typ (typeUnset) darf ein Entscheidungs-Keyword weiterhin auf if fallen', () => {
    const r = heuristicResolveStep(
      { id: 's7', label: 'Prüfen ob Lead heiß ist' },
      INDEX,
    );
    expect(r?.n8n_type).toBe('n8n-nodes-base.if');
  });

  it('step.tool exakt gewinnt gegen ein widersprüchliches Label (chainLlm-Tool trotz "senden" im Label)', () => {
    const r = heuristicResolveStep(
      { id: 's8', label: 'Bericht senden', type: 'action', tool: 'chainLlm' },
      INDEX,
    );
    expect(r?.n8n_type).toBe('@n8n/n8n-nodes-langchain.chainLlm');
  });
});
