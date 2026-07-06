// Rekonstruiert Knowledge-Base-Einträge, deren Quelldatei im Repo fehlt, aus
// der DB zurück auf die Platte (unter ihrem gespeicherten `filepath`).
//
// Hintergrund: Einige Einträge (v.a. knowledge/wissen/**) wurden früher indexiert,
// aber die Quelldateien liegen nicht mehr im Repo. Der Coach zieht sie weiterhin
// per RAG. Dieses Skript holt den Rohinhalt (inkl. Frontmatter) zurück, damit die
// Dateien wieder versioniert und editierbar sind.
//
// Usage:
//   node scripts/export-knowledge-files.mjs            # nur fehlende Dateien schreiben
//   node scripts/export-knowledge-files.mjs --type wissen   # nur ein source_type
//   node scripts/export-knowledge-files.mjs --force    # auch vorhandene überschreiben

import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const force = process.argv.includes('--force');
const typeFilter = arg('type');

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL und ein Key (SERVICE_ROLE bevorzugt) in .env.local nötig.');
  process.exit(1);
}

async function main() {
  const query = new URLSearchParams({
    select: 'filepath,content,source_type',
    is_active: 'eq.true',
    order: 'filepath.asc',
  });
  if (typeFilter) query.set('source_type', `eq.${typeFilter}`);

  const res = await fetch(`${supabaseUrl}/rest/v1/knowledge_base?${query}`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  });
  if (!res.ok) {
    console.error(`✗ Fetch fehlgeschlagen: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const rows = await res.json();

  let written = 0;
  let skipped = 0;
  for (const row of rows) {
    const rel = String(row.filepath || '').replace(/^\/+/, '');
    if (!rel || !row.content) continue;
    const abs = path.join(process.cwd(), rel);
    if (fs.existsSync(abs) && !force) {
      skipped++;
      continue;
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, row.content, 'utf-8');
    console.log(`✓ [${row.source_type}] ${rel}`);
    written++;
  }
  console.log(`\n${written} Datei(en) geschrieben · ${skipped} vorhandene übersprungen.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
