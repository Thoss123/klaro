import { describe, expect, it } from 'vitest';
import { parsePropertyOptionsFromDefinitions } from '@/lib/n8n-node-type-parser';

describe('parsePropertyOptionsFromDefinitions', () => {
  it('extrahiert Union-Literale für httpMethod', () => {
    const defs = `
export interface WebhookV21Params {
    httpMethod?: 'DELETE' | 'GET' | 'POST' | Expression<string>;
    path?: string;
}`;
    const opts = parsePropertyOptionsFromDefinitions(defs, 'httpMethod');
    expect(opts.map(o => o.value)).toEqual(['DELETE', 'GET', 'POST']);
  });

  it('liefert leer wenn Property fehlt', () => {
    expect(parsePropertyOptionsFromDefinitions('export interface X { foo?: string; }', 'bar')).toEqual([]);
  });
});
