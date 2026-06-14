/**
 * One-off: knowledge/node-map/* + geänderte gmail.md in den Supabase-RAG-Index schreiben.
 * Lauf: npx tsx scripts/reindex-node-map.ts (braucht SUPABASE_SERVICE_ROLE_KEY + MISTRAL_API_KEY)
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { reindexKnowledge, indexOne } from '../lib/knowledge-index';

// .env.local manuell laden (kein dotenv im Projekt)
const envFile = path.join(process.cwd(), '.env.local');
for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const result = await reindexKnowledge(supabase, 'node-map');
  console.log('node-map:', JSON.stringify(result));

  const gmail = 'knowledge/tools/gmail.md';
  const entry = await indexOne(supabase, gmail, fs.readFileSync(gmail, 'utf-8'));
  console.log('gmail.md:', JSON.stringify(entry));
}

main().catch(e => { console.error(e); process.exit(1); });
