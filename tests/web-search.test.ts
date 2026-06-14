import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchWeb } from '@/lib/web-search';

const ORIGINAL_KEY = process.env.TAVILY_API_KEY;

describe('searchWeb', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_KEY === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = ORIGINAL_KEY;
  });

  it('fail-open ohne API-Key — wirft nicht, gibt Hinweis zurück', async () => {
    delete process.env.TAVILY_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const res = await searchWeb('was ist onepage');

    expect(res.results).toEqual([]);
    expect(res.answer).toBeNull();
    expect(res.note).toMatch(/eigenes Wissen/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fail-open bei leerer Anfrage — kein Netzwerk-Call', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const res = await searchWeb('   ');

    expect(res.results).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('mappt Tavily-Antwort auf { answer, results } (content → snippet)', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: 'Onepage ist ein Website-Builder.',
          results: [
            { title: 'Onepage', url: 'https://onepage.io', content: 'Landing Pages bauen.', score: 0.9 },
            { title: 'Review', url: 'https://x.com', content: 'Test', score: 0.5 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const res = await searchWeb('onepage', 5);

    expect(res.answer).toBe('Onepage ist ein Website-Builder.');
    expect(res.results).toHaveLength(2);
    expect(res.results[0]).toEqual({
      title: 'Onepage',
      url: 'https://onepage.io',
      snippet: 'Landing Pages bauen.',
    });
    expect(res.note).toBeUndefined();
  });

  it('fail-open bei HTTP-Fehler — gibt Hinweis statt zu werfen', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('rate limited', { status: 429 }),
    );

    const res = await searchWeb('onepage');

    expect(res.results).toEqual([]);
    expect(res.answer).toBeNull();
    expect(res.note).toMatch(/fehlgeschlagen|eigenes Wissen/i);
  });
});
