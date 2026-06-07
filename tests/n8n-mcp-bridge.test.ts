import { describe, expect, it } from 'vitest';
import { buildPinDataFromPrepare } from '@/lib/n8n-mcp-bridge';

describe('buildPinDataFromPrepare', () => {
  it('erzeugt leere json-Zeilen für alle Nodes mit Pin-Bedarf', () => {
    const pin = buildPinDataFromPrepare({
      nodeSchemasToGenerate: { Webhook: { type: 'object' } },
      nodesWithoutSchema: ['Gmail', 'HTTP Request'],
      nodesSkipped: ['Set', 'If'],
    });

    expect(pin).toEqual({
      Webhook: [{ json: {} }],
      Gmail: [{ json: {} }],
      'HTTP Request': [{ json: {} }],
    });
    expect(pin).not.toHaveProperty('Set');
  });

  it('liefert leeres Objekt wenn nichts gepinnt werden muss', () => {
    expect(
      buildPinDataFromPrepare({
        nodeSchemasToGenerate: {},
        nodesWithoutSchema: [],
        nodesSkipped: ['Code'],
      }),
    ).toEqual({});
  });
});
