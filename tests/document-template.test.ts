import { describe, it, expect } from 'vitest';
import { buildTemplateAiInstruction, findTemplateFillStep } from '@/lib/document-template';
import { normalizeDocumentTemplate } from '@/lib/canvas-normalize';
import type { DocumentTemplate, Workflow } from '@/lib/types';

const tmpl: DocumentTemplate = {
  id: 'tmpl_1',
  title: 'Angebot',
  role: 'output',
  delivery: 'document',
  source: 'user_upload',
  content: 'Sehr geehrte {{kunde_name}},\nunser Angebot beläuft sich auf {{summe}}.',
  placeholders: [
    { key: 'kunde_name', label: 'Kundenname', example: 'Mustermann GmbH' },
    { key: 'summe', label: 'Summe' },
  ],
  example_filled: 'Sehr geehrte Mustermann GmbH,\nunser Angebot beläuft sich auf 4.500 €.',
};

describe('buildTemplateAiInstruction', () => {
  it('includes the template, the placeholders and the anonymized example', () => {
    const out = buildTemplateAiInstruction(tmpl);
    expect(out).toContain('## Vorlage');
    expect(out).toContain('{{kunde_name}}');
    expect(out).toContain('## Platzhalter');
    expect(out).toContain('Kundenname');
    expect(out).toContain('z.B. Mustermann GmbH');
    expect(out).toContain('## Beispiel');
    expect(out).toContain('4.500 €');
  });

  it('omits the example section when no example is present', () => {
    const out = buildTemplateAiInstruction({ ...tmpl, example_filled: undefined });
    expect(out).not.toContain('## Beispiel');
  });

  it('describes a message for text delivery', () => {
    const out = buildTemplateAiInstruction({ ...tmpl, delivery: 'text' });
    expect(out).toContain('Nachricht/E-Mail');
  });
});

describe('findTemplateFillStep', () => {
  it('prefers an ai step, falls back to output', () => {
    const wf: Workflow = {
      id: 'wf_1', title: 'W', linked_pain_point: 'pp_1',
      steps: [
        { id: 's1', label: 'Trigger', type: 'trigger' },
        { id: 's2', label: 'KI', type: 'ai' },
        { id: 's3', label: 'Senden', type: 'output' },
      ],
    };
    expect(findTemplateFillStep(wf)).toBe('s2');
  });

  it('detects ai via n8nType when type is missing', () => {
    const wf: Workflow = {
      id: 'wf_1', title: 'W', linked_pain_point: 'pp_1',
      steps: [
        { id: 's1', label: 'Trigger', type: 'trigger' },
        { id: 's2', label: 'OpenAI', n8nType: '@n8n/n8n-nodes-langchain.openAi' },
      ],
    };
    expect(findTemplateFillStep(wf)).toBe('s2');
  });

  it('returns undefined when no ai/output step exists', () => {
    const wf: Workflow = {
      id: 'wf_1', title: 'W', linked_pain_point: 'pp_1',
      steps: [{ id: 's1', label: 'Trigger', type: 'trigger' }],
    };
    expect(findTemplateFillStep(wf)).toBeUndefined();
  });
});

describe('normalizeDocumentTemplate — example_filled', () => {
  it('keeps the anonymized example', () => {
    const t = normalizeDocumentTemplate(
      { title: 'X', content: 'Hallo {{name}}', role: 'output', delivery: 'text', source: 'user_upload',
        placeholders: [{ key: 'name', label: 'Name' }], example_filled: 'Hallo Mustermann' },
      0,
    );
    expect(t?.example_filled).toBe('Hallo Mustermann');
  });
});
