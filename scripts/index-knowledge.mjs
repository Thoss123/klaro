// Indexes /knowledge/**.md into the Supabase `knowledge_base` table.
// One file = one atomic, fully-indexed entry (no chunking).
//
// Usage:
//   node scripts/index-knowledge.mjs            # index everything
//   node scripts/index-knowledge.mjs tools      # only knowledge/tools
//
// Writes are RLS-protected. Provide SUPABASE_SERVICE_ROLE_KEY in .env.local to
// run this standalone. (The admin UI reindex route instead uses the logged-in
// user's session.)

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { Mistral } from '@mistralai/mistralai';

// ── Load .env.local manually (no dotenv dependency) ─────────────────────────
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const KNOWLEDGE_ROOT = path.join(process.cwd(), 'knowledge');

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY || '' });
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// DUMP_JSON=1 → write rows to a JSON file instead of POSTing (offline / admin-import mode).
const DUMP_JSON = process.env.DUMP_JSON === '1';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !DUMP_JSON) {
  console.warn(
    '⚠️  SUPABASE_SERVICE_ROLE_KEY not set — using anon key. Inserts may be blocked by RLS.\n',
  );
}

/** Upsert a row via PostgREST (no realtime — works on Node < 22). */
async function upsertRow(row) {
  const res = await fetch(`${supabaseUrl}/rest/v1/knowledge_base?on_conflict=filepath`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  }
}

export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, body: content };
  const metadata = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    // [a, b] → array
    if (value.startsWith('[') && value.endsWith(']')) {
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

export function getSourceType(relPath) {
  const p = relPath.replace(/\\/g, '/');
  if (p.includes('/use-cases/')) return 'use_case';
  if (p.includes('/tools/')) return 'tool';
  if (p.includes('/templates/bausteine/')) return 'template_baustein';
  if (p.includes('/templates/workflows/')) return 'template_workflow';
  if (p.includes('/branchen/')) return 'branche';
  if (p.includes('/ui-guides/')) return 'ui_guide';
  return 'use_case';
}

function getAllFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...getAllFiles(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

async function indexFile(filePath) {
  const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf-8');
  const { metadata, body } = parseFrontmatter(content);
  const titleMatch = body.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : path.basename(relPath);
  const source_type = getSourceType(relPath);

  // Embed title + (truncated) body so the whole unit is findable.
  const embeddingText =
    content.length > 3000 ? `${title}\n\n${body.slice(0, 2400)}` : content;
  const emb = await mistral.embeddings.create({
    model: 'mistral-embed',
    inputs: [embeddingText],
  });
  const embedding = emb.data[0].embedding;

  const row = {
    filepath: relPath,
    filename: path.basename(relPath),
    title,
    content,
    source_type,
    metadata,
    embedding,
    is_active: true,
    indexed_at: new Date().toISOString(),
  };

  if (DUMP_JSON) {
    dumpedRows.push(row);
  } else {
    await upsertRow(row);
  }
  return { relPath, source_type };
}

const dumpedRows = [];

async function run() {
  const target = process.argv[2];
  const root = target ? path.join(KNOWLEDGE_ROOT, target) : KNOWLEDGE_ROOT;
  const files = getAllFiles(root);
  console.log(`\n📚 ${files.length} Dateien gefunden in ${path.relative(process.cwd(), root) || 'knowledge'}\n`);

  let ok = 0;
  let fail = 0;
  for (const f of files) {
    try {
      const { relPath, source_type } = await indexFile(f);
      console.log(`✅ [${source_type}] ${relPath}`);
      ok++;
    } catch (e) {
      console.error(`❌ ${path.relative(process.cwd(), f)}: ${e.message}`);
      fail++;
    }
    await new Promise((r) => setTimeout(r, 200)); // gentle rate limit
  }
  if (DUMP_JSON) {
    const out = path.join(process.cwd(), 'scripts', '.knowledge-rows.json');
    fs.writeFileSync(out, JSON.stringify(dumpedRows));
    console.log(`📝 ${dumpedRows.length} Zeilen → ${path.relative(process.cwd(), out)}`);
  }
  console.log(`\n✅ ${ok} indexiert · ❌ ${fail} Fehler\n`);
}

// Only run when invoked directly (not when imported for its helpers).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
