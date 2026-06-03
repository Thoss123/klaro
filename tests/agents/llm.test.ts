import { describe, it, expect } from 'vitest';
import { estimateTokens, safeParseJson, asStringArray } from '@/lib/agents/llm';

describe('estimateTokens', () => {
  it('estimates ~4 chars per token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('12345678')).toBe(2);
  });
});

describe('safeParseJson', () => {
  it('parses plain json', () => {
    expect(safeParseJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('strips ```json fences', () => {
    expect(safeParseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('returns null on garbage or empty', () => {
    expect(safeParseJson('not json')).toBeNull();
    expect(safeParseJson('')).toBeNull();
  });
});

describe('asStringArray', () => {
  it('coerces arrays, strings, and junk', () => {
    expect(asStringArray(['a', ' b ', ''])).toEqual(['a', 'b']);
    expect(asStringArray('solo')).toEqual(['solo']);
    expect(asStringArray(null)).toEqual([]);
    expect(asStringArray([1, 2])).toEqual(['1', '2']);
  });
});
