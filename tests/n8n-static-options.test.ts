import { describe, it, expect } from 'vitest';
import { dedupePropertyOptions, resolveStaticOptions, hasLoadOptions } from '@/lib/n8n-static-options';

describe('resolveStaticOptions', () => {
  it('returns Mistral models', () => {
    const opts = resolveStaticOptions('@n8n/n8n-nodes-langchain.lmChatMistralCloud', 'model');
    expect(opts.length).toBeGreaterThan(2);
    expect(opts.some(o => String(o.value).includes('mistral'))).toBe(true);
  });

  it('dedupes options by value', () => {
    const opts = dedupePropertyOptions([
      { name: 'Mistral Medium 3', value: 'mistral-medium-3' },
      { name: 'Mistral Medium 3 (dup)', value: 'mistral-medium-3' },
      { name: 'Small', value: 'mistral-small-latest' },
    ]);
    expect(opts).toHaveLength(2);
    expect(opts.map(o => o.value)).toEqual(['mistral-medium-3', 'mistral-small-latest']);
  });

  it('detects loadOptions properties', () => {
    expect(hasLoadOptions({
      type: 'options',
      options: [],
      typeOptions: { loadOptions: { routing: {} } },
    })).toBe(true);
  });
});
