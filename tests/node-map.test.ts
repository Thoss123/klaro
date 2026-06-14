/**
 * Tests für die Node-Map (Bedienungsanleitung des Workflow-Agents).
 */

import { describe, it, expect } from 'vitest';
import {
  NODE_MAP,
  WIRING_PATTERNS,
  formatNodeMapForPrompt,
  nodeMapEntry,
  swapTargets,
} from '@/lib/node-map';
import { isSubNodeOnlyType, aiSlotsFor } from '@/lib/ai-subnodes';

function resolve(clause: string): string | null {
  const lower = clause.toLowerCase();
  for (const [re, n8nType] of swapTargets()) {
    if (re.test(lower)) return n8nType;
  }
  return null;
}

describe('NODE_MAP Konsistenz', () => {
  it('hat eindeutige n8nTypes', () => {
    const types = NODE_MAP.map(e => e.n8nType);
    expect(new Set(types).size).toBe(types.length);
  });

  it('jeder Eintrag hat aliases und wiringNote', () => {
    for (const e of NODE_MAP) {
      expect(e.aliases.length, e.n8nType).toBeGreaterThan(0);
      expect(e.wiringNote.length, e.n8nType).toBeGreaterThan(10);
    }
  });

  it('subNodeSlot stimmt mit isSubNodeOnlyType aus ai-subnodes überein', () => {
    for (const e of NODE_MAP) {
      expect(!!e.subNodeSlot, e.n8nType).toBe(
        isSubNodeOnlyType(e.n8nType),
      );
    }
  });

  it('AI-Parents der Map haben Slots in ai-subnodes', () => {
    for (const type of [
      '@n8n/n8n-nodes-langchain.agent',
      '@n8n/n8n-nodes-langchain.chainLlm',
      '@n8n/n8n-nodes-langchain.chainSummarization',
      '@n8n/n8n-nodes-langchain.informationExtractor',
      '@n8n/n8n-nodes-langchain.textClassifier',
      '@n8n/n8n-nodes-langchain.sentimentAnalysis',
    ]) {
      expect(nodeMapEntry(type), type).toBeDefined();
      expect(aiSlotsFor(type).length, type).toBeGreaterThan(0);
    }
  });

  it('Google-OAuth-Nodes dokumentieren die zentrale 3-Klick-OAuth-App', () => {
    // Gemini (lmChatGoogleGemini) nutzt einen API-Key, kein OAuth — daher ausgenommen.
    const googleTypes = NODE_MAP.filter(
      e => /gmail|google|youTube/i.test(e.n8nType) && /OAuth2/i.test(e.credentialType ?? ''),
    );
    expect(googleTypes.length).toBeGreaterThanOrEqual(6);
    for (const e of googleTypes) {
      expect(e.wiringNote, e.n8nType).toMatch(/3-Klick|zentrale Google-OAuth/);
    }
  });
});

describe('swapTargets (Regression der alten SWAP_TARGETS)', () => {
  const cases: [string, string][] = [
    ['openai', '@n8n/n8n-nodes-langchain.openAi'],
    ['chatgpt', '@n8n/n8n-nodes-langchain.openAi'],
    ['mistral', '@n8n/n8n-nodes-langchain.lmChatMistralCloud'],
    ['claude', '@n8n/n8n-nodes-langchain.lmChatAnthropic'],
    ['gemini', '@n8n/n8n-nodes-langchain.lmChatGoogleGemini'],
    ['ai agent', '@n8n/n8n-nodes-langchain.agent'],
    ['gmail', 'n8n-nodes-base.gmail'],
    ['e-mail', 'n8n-nodes-base.gmail'],
    ['slack', 'n8n-nodes-base.slack'],
    ['telegram', 'n8n-nodes-base.telegram'],
    ['youtube', 'n8n-nodes-base.youTube'],
    ['facebook', 'n8n-nodes-base.facebookGraphApi'],
    ['notion', 'n8n-nodes-base.notion'],
    ['airtable', 'n8n-nodes-base.airtable'],
    ['google sheets', 'n8n-nodes-base.googleSheets'],
    ['tabelle', 'n8n-nodes-base.googleSheets'],
    ['webhook', 'n8n-nodes-base.webhook'],
    ['zeitplan', 'n8n-nodes-base.scheduleTrigger'],
    ['cron', 'n8n-nodes-base.scheduleTrigger'],
    ['javascript', 'n8n-nodes-base.code'],
    ['feld setzen', 'n8n-nodes-base.set'],
    ['http', 'n8n-nodes-base.httpRequest'],
    ['api request', 'n8n-nodes-base.httpRequest'],
    // Neue Kategorien (Senden, Recherche, Ads, Branchensoftware, Core)
    ['outlook', 'n8n-nodes-base.microsoftOutlook'],
    ['whatsapp', 'n8n-nodes-base.whatsApp'],
    ['sms', 'n8n-nodes-base.twilio'],
    ['teams', 'n8n-nodes-base.microsoftTeams'],
    ['brevo', 'n8n-nodes-base.sendInBlue'],
    ['perplexity', 'n8n-nodes-base.perplexity'],
    ['rss', 'n8n-nodes-base.rssFeedRead'],
    ['google ads', 'n8n-nodes-base.googleAds'],
    ['linkedin', 'n8n-nodes-base.linkedIn'],
    ['pipedrive', 'n8n-nodes-base.pipedrive'],
    ['salesforce', 'n8n-nodes-base.salesforce'],
    ['shopify', 'n8n-nodes-base.shopify'],
    ['stripe', 'n8n-nodes-base.stripe'],
    ['jira', 'n8n-nodes-base.jira'],
    ['calendly', 'n8n-nodes-base.calendlyTrigger'],
    ['typeform', 'n8n-nodes-base.typeformTrigger'],
    ['loop', 'n8n-nodes-base.splitInBatches'],
    ['duplikate entfernen', 'n8n-nodes-base.removeDuplicates'],
    ['klassifizieren', '@n8n/n8n-nodes-langchain.textClassifier'],
    ['groq', '@n8n/n8n-nodes-langchain.lmChatGroq'],
    ['chatbot', '@n8n/n8n-nodes-langchain.chatTrigger'],
  ];

  it.each(cases)('"%s" → %s', (clause, expected) => {
    expect(resolve(clause)).toBe(expected);
  });

  it('kurze Aliase matchen nur ganze Wörter ("ki" nicht in "kickoff")', () => {
    expect(resolve('ki')).toBe('@n8n/n8n-nodes-langchain.openAi');
    expect(resolve('kickoff-meeting planen')).not.toBe(
      '@n8n/n8n-nodes-langchain.openAi',
    );
  });
});

describe('formatNodeMapForPrompt', () => {
  it('enthält Grundregeln und alle Patterns immer', () => {
    const out = formatNodeMapForPrompt([]);
    expect(out).toContain('Grundregeln:');
    for (const p of WIRING_PATTERNS) expect(out).toContain(p.name);
    expect(out).toMatch(/zentrale Google-OAuth-App/);
  });

  it('rendert nur die übergebenen relevanten Nodes', () => {
    const out = formatNodeMapForPrompt(['n8n-nodes-base.gmail']);
    expect(out).toContain('n8n-nodes-base.gmail');
    expect(out).not.toContain('n8n-nodes-base.slack');
  });

  it('ignoriert unbekannte Typen und Duplikate', () => {
    const out = formatNodeMapForPrompt([
      'n8n-nodes-base.gmail',
      'n8n-nodes-base.gmail',
      'völlig-unbekannt.node',
    ]);
    expect(out.split('n8n-nodes-base.gmail (').length - 1).toBe(1);
    expect(out).not.toContain('völlig-unbekannt');
  });

  it('bleibt für einen typischen Workflow unter dem Größenbudget', () => {
    // Selektives Rendering: auch mit allen Map-Nodes als "relevant"
    // bleibt der Block bounded; ein typischer Call (Workflow + 35
    // Kandidaten) rendert deutlich weniger.
    const typical = formatNodeMapForPrompt(
      NODE_MAP.slice(0, 12).map(e => e.n8nType),
    );
    expect(typical.length).toBeLessThan(6000);
    const lineCount = typical.split('\n').length;
    expect(lineCount).toBeLessThan(40);
  });
});
