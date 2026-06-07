/**
 * Unit tests for n8n parameter visibility helpers.
 */

import { describe, it, expect } from 'vitest';
import { isPropertyVisible, getVisibleProperties } from '@/lib/n8n-parameter-utils';
import type { N8nNodeProperty } from '@/lib/n8n-catalog-types';

describe('n8n-parameter-utils', () => {
  it('hides properties when displayOptions.show does not match', () => {
    const prop: N8nNodeProperty = {
      displayName: 'Model',
      name: 'model',
      type: 'options',
      displayOptions: { show: { resource: ['text'] } },
    };
    expect(isPropertyVisible(prop, { resource: 'image' })).toBe(false);
    expect(isPropertyVisible(prop, { resource: 'text' })).toBe(true);
  });

  it('returns only visible renderable properties', () => {
    const properties: N8nNodeProperty[] = [
      { displayName: 'Resource', name: 'resource', type: 'options', default: 'text' },
      {
        displayName: 'Prompt',
        name: 'prompt',
        type: 'string',
        displayOptions: { show: { resource: ['text'] } },
      },
      { displayName: 'Hidden', name: 'hidden', type: 'hidden' },
    ];
    const visible = getVisibleProperties(properties, { resource: 'text' });
    expect(visible.map(p => p.name)).toEqual(['resource', 'prompt']);
  });
});
