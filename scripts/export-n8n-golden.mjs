#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();
  }
}

loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), '.env.local'));

const [workflowId, slug, ...flags] = process.argv.slice(2);
const options = Object.fromEntries(
  flags
    .filter((flag) => flag.startsWith('--') && flag.includes('='))
    .map((flag) => flag.slice(2).split(/=(.*)/s).slice(0, 2)),
);

if (!workflowId || !slug) {
  throw new Error(
    'Aufruf: node scripts/export-n8n-golden.mjs <workflow-id> <slug> ' +
      '--project-id=<uuid> --persona-path=<path> --webhook-path=<path>',
  );
}

const apiBase = process.env.N8N_API_URL?.replace(/\/$/, '');
const apiKey = process.env.N8N_API_KEY;
if (!apiBase || !apiKey) throw new Error('N8N_API_URL oder N8N_API_KEY fehlt.');

const response = await fetch(`${apiBase}/workflows/${workflowId}`, {
  headers: { 'X-N8N-API-KEY': apiKey },
});
if (!response.ok) throw new Error(`n8n-Export fehlgeschlagen (${response.status}).`);
const live = await response.json();

const replacements = new Map(
  [
    [options['app-base'] || 'https://www.axantilo.com', '{{APP_BASE_URL}}'],
    [options['project-id'], '{{PROJECT_ID}}'],
    [options['persona-path'], '{{PERSONA_PATH}}'],
    [options['webhook-path'], '{{EMAIL_SEND_WEBHOOK_PATH}}'],
  ].filter(([value]) => value),
);

function replaceScalars(value) {
  if (typeof value === 'string') {
    let result = value;
    for (const [from, to] of replacements) result = result.split(from).join(to);
    return result;
  }
  if (Array.isArray(value)) return value.map(replaceScalars);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceScalars(entry)]));
  }
  return value;
}

const nodes = live.nodes.map((source) => {
  const node = structuredClone(source);
  delete node.id;
  delete node.credentials;
  delete node.webhookId;

  if (node.name === 'Neue E-Mail') {
    node.type = '{{TRIGGER_NODE}}';
    node.typeVersion = 1;
  }
  if (['Als gelesen markieren', 'Archivieren', 'Antwort senden'].includes(node.name)) {
    node.type = '{{SEND_NODE}}';
    node.typeVersion = 2;
  }
  return replaceScalars(node);
});

const golden = {
  name: options.name || 'AXANTILO: E-Mail Triage & Entwurf',
  nodes,
  connections: live.connections ?? {},
  settings: { executionOrder: 'v1' },
};

const serialized = `${JSON.stringify(golden, null, 2)}\n`;
for (const concrete of replacements.keys()) {
  if (serialized.includes(concrete)) throw new Error(`Konkreter Wert blieb im Export: ${concrete}`);
}
if (serialized.includes('credentials')) throw new Error('Credential-Metadaten blieben im Export.');

const output = path.join(process.cwd(), 'knowledge', 'templates', 'workflows', `${slug}.json`);
fs.writeFileSync(output, serialized, 'utf8');
console.log(`Golden exportiert: ${output} (${nodes.length} Nodes)`);
