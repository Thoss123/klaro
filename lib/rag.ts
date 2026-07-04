import { Mistral } from '@mistralai/mistralai';
import { createSupabaseAnonClient } from './supabase';

export type KnowledgeSourceType =
  | 'use_case'
  | 'tool'
  | 'template_baustein'
  | 'template_workflow'
  | 'branche'
  | 'ui_guide'
  | 'wissen';

export interface KnowledgeMatch {
  id: string;
  source_type: KnowledgeSourceType;
  title: string;
  content: string;
  filepath: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

let mistralClient: Mistral | null = null;
function getMistral(): Mistral {
  if (!mistralClient) {
    mistralClient = new Mistral({ apiKey: process.env.MISTRAL_API_KEY || '' });
  }
  return mistralClient;
}

/** Embed a single text with mistral-embed (1024-dim). */
export async function generateEmbedding(text: string): Promise<number[]> {
  const res = await getMistral().embeddings.create({
    model: 'mistral-embed',
    inputs: [text],
  });
  return res.data[0].embedding as number[];
}

/**
 * Phase → which knowledge types are relevant. Mirrors the coach's needs per phase.
 * diagnose: understand the business · analyse: tools+use cases ·
 * plan: concrete solutions+templates · umsetzung: build details.
 */
const PHASE_TYPE_MAP: Record<string, KnowledgeSourceType[]> = {
  diagnose: ['use_case', 'branche', 'ui_guide', 'wissen'],
  // Gemergte Phase 2 (Analyse & Plan): Tools + konkrete Lösungen/Templates.
  analyse: ['use_case', 'tool', 'branche', 'template_baustein', 'template_workflow', 'ui_guide', 'wissen'],
  plan: ['use_case', 'tool', 'template_baustein', 'template_workflow', 'wissen'], // Legacy-Alias
  umsetzung: ['tool', 'template_baustein', 'template_workflow', 'ui_guide'],
};

/** Semantic search over the global knowledge base.
 *  - `types` (explicit) overrides the phase map — use it for coach-driven lookups.
 *  - `phase` (only when `types` is omitted) restricts to that phase's relevant types.
 *  - neither → search all types. */
export async function searchKnowledge(opts: {
  query: string;
  phase?: string;
  types?: KnowledgeSourceType[] | null;
  matchCount?: number;
  threshold?: number;
}): Promise<KnowledgeMatch[]> {
  const { query, phase, types, matchCount = 5, threshold = 0.4 } = opts;
  if (!query || !query.trim()) return [];

  const embedding = await generateEmbedding(query);
  const filterTypes =
    types !== undefined ? types : phase ? PHASE_TYPE_MAP[phase] ?? null : null;

  const supabase = createSupabaseAnonClient();
  const { data, error } = await supabase.rpc('search_knowledge', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: matchCount,
    filter_types: filterTypes,
  });

  if (error) {
    console.error('[RAG] search_knowledge error:', error.message);
    return [];
  }
  return (data as KnowledgeMatch[]) || [];
}

/**
 * Retrieve relevant knowledge and format it for injection into the system prompt.
 * Returns '' when nothing relevant is found (fail-open).
 */
export async function retrieveRelevantKnowledge(
  query: string,
  phase?: string,
  limit = 4,
): Promise<string> {
  try {
    const results = await searchKnowledge({ query, phase, matchCount: limit });
    if (!results.length) return '';

    const sections = results
      .map(
        (r) =>
          `### ${r.source_type.toUpperCase()}: ${r.title}\n(Quelle: ${r.filepath} · Relevanz: ${(r.similarity * 100).toFixed(0)}%)\n\n${r.content}`,
      )
      .join('\n\n---\n\n');

    return `\n\n## RELEVANTES WISSEN AUS DER DATENBANK\nNutze die folgenden Informationen, um die Frage des Nutzers fundiert zu beantworten. Erfinde nichts dazu.\n\n${sections}\n`;
  } catch (err) {
    console.error('[RAG] retrieval failed:', err);
    return '';
  }
}
