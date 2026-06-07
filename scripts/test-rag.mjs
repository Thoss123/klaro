// Smoke test for the RAG retrieval pipeline: embed a query (Mistral) → call the
// search_knowledge RPC (PostgREST, anon) → print matches. Mirrors lib/rag.ts.
import fs from 'fs';
import path from 'path';
import { Mistral } from '@mistralai/mistralai';

for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const PHASE_TYPE_MAP = {
  diagnose: ['use_case', 'branche', 'ui_guide'],
  analyse: ['use_case', 'tool', 'branche', 'ui_guide'],
  plan: ['use_case', 'tool', 'template_baustein', 'template_workflow'],
  umsetzung: ['tool', 'template_baustein', 'template_workflow', 'ui_guide'],
};

async function search(query, phase) {
  const emb = await mistral.embeddings.create({ model: 'mistral-embed', inputs: [query] });
  const res = await fetch(`${url}/rest/v1/rpc/search_knowledge`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query_embedding: emb.data[0].embedding,
      match_threshold: 0.4,
      match_count: 5,
      filter_types: phase ? PHASE_TYPE_MAP[phase] : null,
    }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

const cases = [
  { q: 'Ich verliere viel Zeit mit Angeboten schreiben nach Kundengesprächen', phase: 'diagnose' },
  { q: 'Welches Tool soll ich für E-Mails nehmen?', phase: 'analyse' },
  { q: 'Ich will vor dem Versand nochmal selbst freigeben können', phase: 'plan' },
  { q: 'Wie verbinde ich ein Tool in den Einstellungen?', phase: 'umsetzung' },
  { q: 'Was sind die typischen Probleme einer Webdesign-Agentur?', phase: undefined },
];

for (const c of cases) {
  const rows = await search(c.q, c.phase);
  console.log(`\n🔎 [${c.phase ?? 'all'}] "${c.q}"`);
  if (!rows.length) console.log('   (keine Treffer)');
  for (const r of rows) {
    console.log(`   ${(r.similarity * 100).toFixed(0)}%  ${r.source_type.padEnd(18)} ${r.title}`);
  }
}
console.log('');
