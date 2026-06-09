import { describe, it, expect } from 'vitest';
import { parseOcrPages } from '@/lib/image-ocr';

describe('parseOcrPages', () => {
  it('joins markdown from multiple pages', () => {
    const text = parseOcrPages([
      { markdown: 'Zeile 1' },
      { markdown: 'Zeile 2' },
    ]);
    expect(text).toBe('Zeile 1\n\nZeile 2');
  });

  it('returns empty string for invalid input', () => {
    expect(parseOcrPages(null)).toBe('');
    expect(parseOcrPages([{ foo: 'bar' }])).toBe('');
  });
});
