/**
 * One-shot company research, run right after onboarding (before the first
 * chat message) so Phase 1 can open with a rough idea of what the company
 * does instead of asking cold. Reuses the same Tavily search backing the
 * `web_search` tool, just invoked directly server-side instead of via an
 * LLM tool call.
 *
 * Fail-open by design: no key / no results / error → null, onboarding never
 * blocks on this.
 */
import { searchWeb } from '@/lib/web-search';

/** "www.muster.de/" / "https://muster.de" → "muster.de" */
export function normalizeWebsiteDomain(website?: string): string | null {
  const raw = (website || '').trim().toLowerCase();
  if (!raw) return null;
  const domain = raw
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    .trim();
  // Minimal-Plausibilität: mindestens ein Punkt, keine Leerzeichen.
  if (!domain || !domain.includes('.') || /\s/.test(domain)) return null;
  return domain;
}

/**
 * Research `firmenname` (+ optional `branche`, `website`) and return a short
 * German summary suitable for direct injection into the coach's system
 * prompt, or null if nothing useful was found. Mit Website liefert die Suche
 * deutlich präzisere Treffer (Domain geht mit in die Query).
 */
export async function researchCompany(
  firmenname: string,
  branche?: string,
  website?: string,
): Promise<string | null> {
  const name = (firmenname || '').trim();
  if (!name) return null;

  const domain = normalizeWebsiteDomain(website);
  const parts = [name];
  if (branche?.trim()) parts.push(branche.trim());
  if (domain) parts.push(domain);
  const query = `${parts.join(' ')} Unternehmen Angebot Leistungen`;

  const { answer, results } = await searchWeb(query, 5);

  // Mit bekannter Domain: Treffer von der eigenen Website nach vorn ziehen.
  const ranked = domain
    ? [...results].sort((a, b) => {
        const aOwn = a.url?.includes(domain) ? 0 : 1;
        const bOwn = b.url?.includes(domain) ? 0 : 1;
        return aOwn - bOwn;
      })
    : results;

  if (answer) {
    const extra = ranked
      .filter((r) => domain && r.url?.includes(domain))
      .map((r) => r.snippet)
      .filter(Boolean)
      .slice(0, 1);
    return [answer.trim(), ...extra].join(' ').trim();
  }

  const snippets = ranked
    .map((r) => r.snippet)
    .filter(Boolean)
    .slice(0, 2);
  if (snippets.length) return snippets.join(' ').trim();

  return null;
}
