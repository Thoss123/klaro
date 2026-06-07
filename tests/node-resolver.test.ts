/**
 * Unit tests for NodeResolver heuristics.
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
    klaroCategory: 'action',
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
    klaroCategory: 'ai',
  },
];

describe('heuristicResolveStep', () => {
  it('maps ai step type to OpenAI node', () => {
    const r = heuristicResolveStep(
      { id: 's1', label: 'Text zusammenfassen', type: 'ai' },
      INDEX,
    );
    expect(r?.n8n_type).toContain('openAi');
  });

  it('maps email label to Gmail', () => {
    const r = heuristicResolveStep(
      { id: 's2', label: 'Email senden', type: 'action' },
      INDEX,
    );
    expect(r?.n8n_type).toBe('n8n-nodes-base.gmail');
  });
});
