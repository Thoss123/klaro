import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding, type KnowledgeSourceType } from './rag';

export const KNOWLEDGE_ROOT = path.join(process.cwd(), 'knowledge');

export function parseFrontmatter(content: string): {
  metadata: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, body: content };
  const metadata: Record<string, unknown> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value: unknown = line.slice(idx + 1).trim();
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (key) metadata[key] = value;
  }
  return { metadata, body: match[2] };
}

export function getSourceType(relPath: string): KnowledgeSourceType {
  const p = relPath.replace(/\\/g, '/');
  if (p.includes('/use-cases/')) return 'use_case';
  if (p.includes('/tools/')) return 'tool';
  if (p.includes('/templates/bausteine/')) return 'template_baustein';
  if (p.includes('/node-map/')) return 'template_baustein';
  if (p.includes('/templates/workflows/')) return 'template_workflow';
  if (p.includes('/branchen/')) return 'branche';
  if (p.includes('/ui-guides/')) return 'ui_guide';
  return 'use_case';
}

export function getAllKnowledgeFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...getAllKnowledgeFiles(full));
    // README/CONTRIBUTING sind Entwickler-Doku, keine RAG-Chunks → nicht indexieren.
    else if (entry.name.endsWith('.md') && !/^readme\.md$/i.test(entry.name)) out.push(full);
  }
  return out;
}

export interface ReindexResult {
  indexed: number;
  failed: number;
  errors: { file: string; error: string }[];
}

export interface IndexedEntry {
  filepath: string;
  title: string;
  source_type: KnowledgeSourceType;
}

/** Embed one piece of content and upsert it as a single atomic entry. */
export async function indexOne(
  supabase: SupabaseClient,
  relPath: string,
  content: string,
): Promise<IndexedEntry> {
  const { metadata, body } = parseFrontmatter(content);
  const titleMatch = body.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : path.basename(relPath);
  const source_type = getSourceType(relPath);
  const embeddingText =
    content.length > 3000 ? `${title}\n\n${body.slice(0, 2400)}` : content;
  const embedding = await generateEmbedding(embeddingText);

  const { error } = await supabase.from('knowledge_base').upsert(
    {
      filepath: relPath,
      filename: path.basename(relPath),
      title,
      content,
      source_type,
      metadata,
      embedding,
      is_active: true,
      indexed_at: new Date().toISOString(),
    },
    { onConflict: 'filepath' },
  );
  if (error) throw new Error(error.message);
  return { filepath: relPath, title, source_type };
}

/**
 * Normalize a user-supplied path to a `knowledge/...` forward-slash relative path
 * and the absolute on-disk path. Throws on traversal or non-.md paths.
 */
export function resolveKnowledgePath(input: string): { relPath: string; absPath: string } {
  let p = input.trim().replace(/\\/g, '/').replace(/^\.?\//, '');
  if (!p) throw new Error('Pfad fehlt.');
  if (!p.startsWith('knowledge/')) p = `knowledge/${p}`;
  if (!p.endsWith('.md')) throw new Error('Pfad muss auf .md enden.');
  const absPath = path.resolve(process.cwd(), p);
  if (absPath !== KNOWLEDGE_ROOT && !absPath.startsWith(KNOWLEDGE_ROOT + path.sep)) {
    throw new Error('Pfad muss innerhalb von /knowledge liegen.');
  }
  return { relPath: p, absPath };
}

/**
 * Write pasted markdown to /knowledge/<path> on disk and index it.
 * (Disk write persists the file into the repo locally; on read-only hosts it
 * would throw — callers may treat that as non-fatal and still index.)
 */
export async function uploadAndIndex(
  supabase: SupabaseClient,
  inputPath: string,
  content: string,
): Promise<IndexedEntry> {
  if (!content.trim()) throw new Error('Inhalt ist leer.');
  const { relPath, absPath } = resolveKnowledgePath(inputPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, 'utf-8');
  return indexOne(supabase, relPath, content);
}

/**
 * Re-embed knowledge files from disk and upsert them via the given Supabase
 * client. The client must use service role for writes (admin routes after getAdminUser).
 */
export async function reindexKnowledge(
  supabase: SupabaseClient,
  folder?: string,
): Promise<ReindexResult> {
  const root = folder ? path.join(KNOWLEDGE_ROOT, folder) : KNOWLEDGE_ROOT;
  const files = getAllKnowledgeFiles(root);
  const result: ReindexResult = { indexed: 0, failed: 0, errors: [] };

  for (const file of files) {
    const relPath = path.relative(process.cwd(), file).replace(/\\/g, '/');
    try {
      const content = fs.readFileSync(file, 'utf-8');
      await indexOne(supabase, relPath, content);
      result.indexed++;
    } catch (e) {
      result.failed++;
      result.errors.push({ file: relPath, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}
