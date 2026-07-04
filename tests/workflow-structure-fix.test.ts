/**
 * Tests für die strukturelle Workflow-Bau-Korrektur:
 * NODE_MAP-Regeln/Capabilities, node-resolver (human→Kanal, selfProduces→Trigger,
 * Chain-vs-Agent, keine Blind-Sets), expandPatterns (Freigabe-Schleife + Set-Bereinigung),
 * splitSharedAiSubNodes (eigenes Modell je Agent), Pflichtfeld-Erkennung.
 */

import { describe, it, expect } from 'vitest';
import type { N8nCatalogIndexEntry } from '@/lib/n8n-catalog-types';
import type { WorkflowEdge, WorkflowStep } from '@/lib/types';
import { heuristicResolveStep } from '@/lib/agents/node-resolver';
import {
  matchMainNodeType,
  matchToolCapability,
  formatNodeMapForPrompt,
  TOOL_CAPABILITIES,
} from '@/lib/node-map';
import { expandPatterns, planEdgesToWorkflowEdges } from '@/lib/workflow-expand';
import { splitSharedAiSubNodes } from '@/lib/ai-subnodes';
import { missingCrucialParams } from '@/lib/n8n-parameter-utils';
import { describeNodeForPrompt, nodeOperationSummary } from '@/lib/n8n-node-doc';
import type { N8nNodeProperty, N8nNodeTypeDescription } from '@/lib/n8n-catalog-types';

function entry(name: string, displayName: string, category: string, cred?: string): N8nCatalogIndexEntry {
  return {
    name,
    displayName,
    version: 1,
    groups: ['transform'],
    categories: [],
    aliases: [],
    hasCredentials: !!cred,
    credentialTypes: cred ? [cred] : [],
    iconPath: null,
    axantiloCategory: category,
  };
}

const INDEX: N8nCatalogIndexEntry[] = [
  entry('n8n-nodes-base.manualTrigger', 'Manual Trigger', 'trigger'),
  entry('n8n-nodes-base.scheduleTrigger', 'Schedule Trigger', 'trigger'),
  entry('n8n-nodes-base.webhook', 'Webhook', 'trigger'),
  entry('n8n-nodes-base.gmailTrigger', 'Gmail Trigger', 'trigger', 'gmailOAuth2'),
  entry('n8n-nodes-base.gmail', 'Gmail', 'action', 'gmailOAuth2'),
  entry('n8n-nodes-base.slack', 'Slack', 'action', 'slackApi'),
  entry('n8n-nodes-base.googleDrive', 'Google Drive', 'action', 'googleDriveOAuth2Api'),
  entry('n8n-nodes-base.if', 'If', 'flow'),
  entry('n8n-nodes-base.set', 'Edit Fields (Set)', 'data'),
  entry('n8n-nodes-base.httpRequest', 'HTTP Request', 'action'),
  entry('@n8n/n8n-nodes-langchain.agent', 'AI Agent', 'ai'),
  entry('@n8n/n8n-nodes-langchain.chainLlm', 'Basic LLM Chain', 'ai'),
  entry('@n8n/n8n-nodes-langchain.chainSummarization', 'Summarization Chain', 'ai'),
];

describe('NODE_MAP Tool-Capabilities & Matcher', () => {
  it('kennt Fireflies/Otter als selbst-transkribierend', () => {
    const cap = matchToolCapability('Meeting durch Fireflies transkribieren');
    expect(cap?.selfProduces).toBe('transkript');
    expect(cap?.triggerNode).toBe('n8n-nodes-base.webhook');
  });

  it('TOOL_CAPABILITIES enthält mindestens den Transkriptions-Eintrag', () => {
    expect(TOOL_CAPABILITIES.some(c => c.selfProduces === 'transkript')).toBe(true);
  });

  it('matchMainNodeType überspringt Sub-Node-only-Typen (mistral)', () => {
    // "mistral" zeigt nur auf das Chat-Model-Sub-Node → darf NICHT als Hauptschritt kommen.
    expect(matchMainNodeType('mistral')).toBeUndefined();
  });

  it('matchMainNodeType findet echte Haupt-Nodes (gmail)', () => {
    expect(matchMainNodeType('mail senden')).toBe('n8n-nodes-base.gmail');
  });

  it('formatNodeMapForPrompt enthält die Kernregeln', () => {
    const out = formatNodeMapForPrompt([]);
    expect(out).toMatch(/EINE Node = EINE Aufgabe/i);
    expect(out).toMatch(/sendAndWait/);
    expect(out).toMatch(/Basic LLM Chain|chainLlm/);
  });
});

describe('node-resolver Struktur-Regeln', () => {
  it('human-Schritt → Kanal-Node (nie Set)', () => {
    const r = heuristicResolveStep({ id: 'h', label: 'Freigabe einholen', type: 'human' }, INDEX);
    expect(r?.n8n_type).toBe('n8n-nodes-base.gmail');
    expect(r?.n8n_type).not.toBe('n8n-nodes-base.set');
  });

  it('human-Schritt „per Slack" → Slack', () => {
    const r = heuristicResolveStep({ id: 'h', label: 'Freigabe per Slack', type: 'human' }, INDEX);
    expect(r?.n8n_type).toBe('n8n-nodes-base.slack');
  });

  it('selbst-transkribierendes Tool → Quelle/Trigger, NICHT KI-Agent', () => {
    const r = heuristicResolveStep({ id: 's', label: 'Meeting mit Fireflies transkribieren', type: 'ai' }, INDEX);
    expect(r?.n8n_type).toBe('n8n-nodes-base.webhook');
  });

  it('feste KI-Aufgabe (zusammenfassen) → Chain, nicht Agent', () => {
    const r = heuristicResolveStep({ id: 's', label: 'Transkript zusammenfassen', type: 'ai' }, INDEX);
    expect(r?.n8n_type).toBe('@n8n/n8n-nodes-langchain.chainSummarization');
  });

  it('offene KI-Aufgabe (Agent recherchiert) → Agent', () => {
    const r = heuristicResolveStep({ id: 's', label: 'Agent recherchiert den Markt', type: 'ai' }, INDEX);
    expect(r?.n8n_type).toBe('@n8n/n8n-nodes-langchain.agent');
  });

  it('Trigger wählt echte Quelle (neue Mail → gmailTrigger)', () => {
    const r = heuristicResolveStep({ id: 't', label: 'Neue Mail im Posteingang', type: 'trigger' }, INDEX);
    expect(r?.n8n_type).toBe('n8n-nodes-base.gmailTrigger');
  });

  it('kein Blind-Set: vager output-Schritt liefert keinen Set-Node aus der Heuristik', () => {
    const r = heuristicResolveStep({ id: 'o', label: 'Ergebnis weitergeben', type: 'output' }, INDEX);
    expect(r?.n8n_type).not.toBe('n8n-nodes-base.set');
  });

  it('expliziter Set bleibt Set', () => {
    const r = heuristicResolveStep({ id: 'o', label: 'Felder setzen', type: 'action' }, INDEX);
    expect(r?.n8n_type).toBe('n8n-nodes-base.set');
  });
});

describe('expandPatterns — Freigabe-Schleife', () => {
  const steps: WorkflowStep[] = [
    { id: 's1', label: 'Start', type: 'trigger', n8nType: 'n8n-nodes-base.webhook' },
    { id: 's2', label: 'Entwurf', type: 'ai', n8nType: '@n8n/n8n-nodes-langchain.chainLlm' },
    { id: 's3', label: 'Freigabe', type: 'human', n8nType: 'n8n-nodes-base.gmail' },
    { id: 's4', label: 'Senden', type: 'action', n8nType: 'n8n-nodes-base.gmail' },
  ];
  const edges: WorkflowEdge[] = [
    { id: 'e1', source: 's1', target: 's2', branch: 'default' },
    { id: 'e2', source: 's2', target: 's3', branch: 'default' },
    { id: 'e3', source: 's3', target: 's4', branch: 'default' },
  ];

  it('macht aus human → sendAndWait + IF + Loopback', () => {
    const out = expandPatterns(steps, edges);
    const human = out.steps.find(s => s.id === 's3')!;
    expect(human.parameters?.operation).toBe('sendAndWait');

    const ifStep = out.steps.find(s => s.n8nType === 'n8n-nodes-base.if');
    expect(ifStep).toBeDefined();

    // human → IF
    expect(out.edges.some(e => e.source === 's3' && e.target === ifStep!.id)).toBe(true);
    // IF --true--> Senden
    expect(out.edges.some(e => e.source === ifStep!.id && e.target === 's4' && e.branch === 'true')).toBe(true);
    // IF --false--> zurück zum Erzeuger (s2)
    expect(out.edges.some(e => e.source === ifStep!.id && e.target === 's2' && e.branch === 'false')).toBe(true);
  });

  it('ist idempotent (kein zweites IF bei erneutem Lauf)', () => {
    const once = expandPatterns(steps, edges);
    const twice = expandPatterns(once.steps, once.edges);
    const ifCount = twice.steps.filter(s => s.n8nType === 'n8n-nodes-base.if').length;
    expect(ifCount).toBe(1);
  });
});

describe('expandPatterns — Set-Bereinigung', () => {
  it('entfernt Durchreich-Set und verbindet durch', () => {
    const steps: WorkflowStep[] = [
      { id: 's1', label: 'Start', type: 'trigger', n8nType: 'n8n-nodes-base.webhook' },
      { id: 's2', label: 'Durchreichen', type: 'output', n8nType: 'n8n-nodes-base.set' },
      { id: 's3', label: 'Ende', type: 'action', n8nType: 'n8n-nodes-base.gmail' },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 's1', target: 's2', branch: 'default' },
      { id: 'e2', source: 's2', target: 's3', branch: 'default' },
    ];
    const out = expandPatterns(steps, edges);
    expect(out.steps.find(s => s.id === 's2')).toBeUndefined();
    expect(out.edges.some(e => e.source === 's1' && e.target === 's3')).toBe(true);
  });

  it('behält Set mit echten Zuweisungen', () => {
    const steps: WorkflowStep[] = [
      { id: 's1', label: 'Start', type: 'trigger', n8nType: 'n8n-nodes-base.webhook' },
      {
        id: 's2', label: 'Mappen', type: 'action', n8nType: 'n8n-nodes-base.set',
        parameters: { assignments: { assignments: [{ name: 'x', value: '=1' }] } },
      },
      { id: 's3', label: 'Ende', type: 'action', n8nType: 'n8n-nodes-base.gmail' },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 's1', target: 's2', branch: 'default' },
      { id: 'e2', source: 's2', target: 's3', branch: 'default' },
    ];
    const out = expandPatterns(steps, edges);
    expect(out.steps.find(s => s.id === 's2')).toBeDefined();
  });
});

describe('planEdgesToWorkflowEdges', () => {
  const steps = [{ id: 'step_1' }, { id: 'step_2' }, { id: 'step_3' }];
  it('mappt 1-basierte from/to auf Schritt-IDs', () => {
    const out = planEdgesToWorkflowEdges([{ from: 1, to: 2 }, { from: 2, to: 3, branch: 'true' }], steps);
    expect(out).toHaveLength(2);
    expect(out![0]).toMatchObject({ source: 'step_1', target: 'step_2' });
    expect(out![1]).toMatchObject({ source: 'step_2', target: 'step_3', branch: 'true' });
  });
  it('verwirft ungültige Edges und gibt null bei keiner gültigen', () => {
    expect(planEdgesToWorkflowEdges([{ from: 9, to: 12 }], steps)).toBeNull();
    expect(planEdgesToWorkflowEdges([], steps)).toBeNull();
  });
});

describe('splitSharedAiSubNodes — eigenes Modell je Agent', () => {
  it('klont ein geteiltes Chat-Model für den zweiten Agenten', () => {
    const steps: WorkflowStep[] = [
      { id: 'a', label: 'Agent A', type: 'ai', n8nType: '@n8n/n8n-nodes-langchain.agent' },
      { id: 'b', label: 'Agent B', type: 'ai', n8nType: '@n8n/n8n-nodes-langchain.agent' },
      { id: 'm', label: 'Model', type: 'ai', n8nType: '@n8n/n8n-nodes-langchain.lmChatMistralCloud', subNodeOf: { parentId: 'a', slot: 'ai_languageModel' } },
    ];
    const edges: WorkflowEdge[] = [
      { id: 'e1', source: 'm', target: 'a', connectionType: 'ai_languageModel' },
      { id: 'e2', source: 'm', target: 'b', connectionType: 'ai_languageModel' },
    ];
    const out = splitSharedAiSubNodes(steps, edges);
    // Jeder Model-Edge hat jetzt eine eigene Quelle.
    const modelSources = new Set(out.edges.filter(e => e.connectionType === 'ai_languageModel').map(e => e.source));
    expect(modelSources.size).toBe(2);
    // Es gibt einen Klon, der an B hängt.
    const clone = out.steps.find(s => s.subNodeOf?.parentId === 'b');
    expect(clone).toBeDefined();
    expect(clone!.id).not.toBe('m');
  });
});

describe('describeNodeForPrompt — Node erklärt sich selbst', () => {
  const node: N8nNodeTypeDescription = {
    name: 'n8n-nodes-base.fooBar',
    displayName: 'Foo Bar',
    description: 'Verbindet sich mit FooBar und verwaltet Datensätze.',
    version: 1,
    properties: [
      {
        displayName: 'Operation', name: 'operation', type: 'options',
        options: [
          { name: 'Create', value: 'create', action: 'Create a record' },
          { name: 'Get', value: 'get', action: 'Get a record' },
        ],
      } as N8nNodeProperty,
    ],
  };

  it('liefert Beschreibung + Aktionen für einen unbekannten Node', () => {
    const out = describeNodeForPrompt(node);
    expect(out).toContain('FooBar');
    expect(out).toContain('Aktionen:');
    expect(out).toContain('Create a record');
  });

  it('nodeOperationSummary liest die Operationen aus dem Schema', () => {
    expect(nodeOperationSummary(node)).toEqual(['Create a record', 'Get a record']);
  });

  it('kürzt zu lange Beschreibungen', () => {
    const long = describeNodeForPrompt({ ...node, description: 'x'.repeat(400), properties: [] }, { maxDescLen: 50 });
    expect(long.length).toBeLessThanOrEqual(51);
  });
});

describe('missingCrucialParams — Pflichtfelder', () => {
  const props: N8nNodeProperty[] = [
    { displayName: 'Base', name: 'base', type: 'resourceLocator' } as N8nNodeProperty,
    { displayName: 'Table', name: 'table', type: 'resourceLocator' } as N8nNodeProperty,
    { displayName: 'Limit', name: 'limit', type: 'number', default: 100 } as N8nNodeProperty,
  ];

  it('meldet leere resourceLocator-Pflichtfelder', () => {
    const missing = missingCrucialParams(props, { limit: 100 });
    const names = missing.map(p => p.name);
    expect(names).toContain('base');
    expect(names).toContain('table');
    expect(names).not.toContain('limit');
  });

  it('gilt als gefüllt, wenn resourceLocator einen Wert hat', () => {
    const missing = missingCrucialParams(props, {
      base: { mode: 'list', value: 'app123' },
      table: { mode: 'list', value: 'tbl9' },
    });
    expect(missing).toHaveLength(0);
  });
});
