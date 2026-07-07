import { readFileSync } from 'fs';
import path from 'path';
import { normalizePhase } from '@/lib/phases';
import type { Phase } from '@/lib/types';

/** Mindset-Nummern pro App-Phase (3-Phasen-Modell, abgeleitet aus roadmap Sprint 4.1). */
export const PHASE_MINDSET_NUMBERS: Record<Phase, readonly number[]> = {
  diagnose: [2, 4],
  analyse: [1, 3, 4, 6, 7],
  umsetzung: [5, 8],
};

type ParsedMindset = {
  number: number;
  title: string;
  haltung: string;
};

const fileCache = new Map<string, string>();

function loadMindsetMarkdown(): string {
  const cacheKey = 'mindset.md';
  if (process.env.NODE_ENV === 'production') {
    const cached = fileCache.get(cacheKey);
    if (cached !== undefined) return cached;
  }
  const filePath = path.join(process.cwd(), 'knowledge', 'mindset.md');
  const content = readFileSync(filePath, 'utf8');
  fileCache.set(cacheKey, content);
  return content;
}

/** Parst die 8 Mindset-Abschnitte aus knowledge/mindset.md. */
export function parseMindsets(markdown: string): ParsedMindset[] {
  const sections = markdown.split(/\n(?=## \d+\. )/);
  const results: ParsedMindset[] = [];

  for (const section of sections) {
    const headerMatch = section.match(/^## (\d+)\. (.+)$/m);
    if (!headerMatch) continue;

    const number = Number(headerMatch[1]);
    const title = headerMatch[2].trim();
    const haltungMatch = section.match(/\*\*Die Haltung:\*\*\s*\n([\s\S]*?)(?=\n\*\*Wann kommt das auf\?\*\*|\n---|\n## |$)/);
    const haltung = haltungMatch?.[1]?.trim() ?? '';
    if (haltung) {
      results.push({ number, title, haltung });
    }
  }

  return results.sort((a, b) => a.number - b.number);
}

function getMindsetsByNumbers(numbers: readonly number[]): ParsedMindset[] {
  const all = parseMindsets(loadMindsetMarkdown());
  const wanted = new Set(numbers);
  return all.filter((m) => wanted.has(m.number));
}

/**
 * Kompakter Mindset-Block für den Coach-System-Prompt (~200 Tokens).
 * Fail-open: leerer String, wenn Datei fehlt oder Phase unbekannt.
 */
export function formatMindsetBlock(phase?: string | null): string {
  try {
    const normalized = normalizePhase(phase);
    const numbers = PHASE_MINDSET_NUMBERS[normalized];
    const mindsets = getMindsetsByNumbers(numbers);
    if (!mindsets.length) return '';

    const excerpts = mindsets
      .map((m) => `- **${m.title}:** ${m.haltung.replace(/\s+/g, ' ').trim()}`)
      .join('\n');

    return (
      `\n\n## Deine Haltung zu diesem Thema (intern — nicht predigen)\n` +
      `Diese Leitlinien sind dein innerer Kompass. Nutze sie beiläufig in Ton und Argumentation — ` +
      `erwähne nie „Mindset", „Haltung" oder dass du eine Leitlinie anwendest:\n\n${excerpts}\n`
    );
  } catch (e: unknown) {
    console.warn('[mindset-inject] failed (fail-open):', e instanceof Error ? e.message : String(e));
    return '';
  }
}
