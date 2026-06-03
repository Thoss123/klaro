#!/usr/bin/env node
/**
 * Sprint 2 — n8n connectivity test.
 *
 *   npm run test:n8n
 *
 * Isolates the n8n REST contract from the Next app so you know whether a failure
 * is infrastructure (VPS / key / URL) or app code. Reads env from .env.local.
 *
 *   MOCK_N8N=true   → validates the hello-world JSON, no network calls.
 *   MOCK_N8N=false  → create → activate → list executions → deactivate → delete
 *                      against the real instance (cleans up after itself).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Minimal .env.local loader (no dependency on dotenv) ──────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // .env.local optional — fall back to process.env (e.g. CI / Vercel)
  }
}
loadEnv();

const API_URL = (process.env.N8N_API_URL || 'http://localhost:5678/api/v1').replace(/\/$/, '');
const API_KEY = process.env.N8N_API_KEY || '';
const MOCK = process.env.MOCK_N8N === 'true';

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const info = (m) => console.log(`  \x1b[36mℹ\x1b[0m ${m}`);
const fail = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const step = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

async function n8n(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-N8N-API-KEY': API_KEY, ...(options.headers || {}) },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const err = new Error(`${options.method || 'GET'} ${path} → ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function diagnose(e) {
  if (e.status === 401) fail('401 Unauthorized → check N8N_API_KEY, and that N8N_API_URL ends in /api/v1');
  else if (e.code === 'ECONNREFUSED' || /fetch failed/i.test(e.message)) fail('Connection refused → n8n not reachable at N8N_API_URL (use the public HTTPS domain, not localhost, from Vercel)');
  else if (e.status === 404) fail('404 → wrong path or N8N_API_URL missing /api/v1');
  else fail(`${e.message}${e.body ? ' — ' + JSON.stringify(e.body).slice(0, 200) : ''}`);
}

async function main() {
  console.log('\x1b[1m=== Klaro Sprint 2 — n8n test ===\x1b[0m');
  info(`N8N_API_URL = ${API_URL}`);
  info(`N8N_API_KEY = ${API_KEY ? API_KEY.slice(0, 4) + '…(' + API_KEY.length + ' chars)' : '(empty)'}`);
  info(`MOCK_N8N    = ${MOCK}`);

  const hello = JSON.parse(readFileSync(join(__dirname, 'n8n-hello-workflow.json'), 'utf8'));

  if (MOCK) {
    step('MOCK mode — no network calls');
    if (!hello.name || !Array.isArray(hello.nodes) || hello.nodes.length < 2) {
      fail('hello-world JSON looks invalid'); process.exit(1);
    }
    ok(`hello-world JSON valid: "${hello.name}" with ${hello.nodes.length} nodes`);
    info('Set MOCK_N8N=false (with a real N8N_API_URL + N8N_API_KEY) to run the live test.');
    console.log('\n\x1b[32mMock check passed.\x1b[0m');
    return;
  }

  if (!API_KEY) { fail('N8N_API_KEY is empty but MOCK_N8N=false'); process.exit(1); }

  let createdId = null;
  try {
    step('1/6  GET /workflows  (auth + reachability)');
    const list = await n8n('/workflows?limit=1');
    ok(`reachable — ${Array.isArray(list?.data) ? list.data.length : 0} workflow(s) returned`);

    step('2/6  POST /workflows  (create hello-world)');
    const created = await n8n('/workflows', { method: 'POST', body: JSON.stringify(hello) });
    createdId = created.id;
    ok(`created workflow id=${createdId}`);

    step('3/6  POST /workflows/:id/activate');
    try { await n8n(`/workflows/${createdId}/activate`, { method: 'POST' }); ok('activated'); }
    catch (e) { info(`activate skipped (${e.status || e.message}) — manual-trigger workflows can't be activated, that's fine`); }

    step('4/6  GET /executions?workflowId=:id');
    const ex = await n8n(`/executions?workflowId=${createdId}&limit=10`);
    ok(`executions endpoint ok — ${Array.isArray(ex?.data) ? ex.data.length : 0} run(s)`);

    step('5/6  POST /workflows/:id/deactivate');
    try { await n8n(`/workflows/${createdId}/deactivate`, { method: 'POST' }); ok('deactivated'); }
    catch { info('deactivate skipped'); }

    step('6/6  DELETE /workflows/:id  (cleanup)');
    await n8n(`/workflows/${createdId}`, { method: 'DELETE' });
    ok('deleted test workflow');

    console.log('\n\x1b[32mLive n8n test passed. Sprint 2 backend connectivity is green.\x1b[0m');
  } catch (e) {
    console.log('');
    diagnose(e);
    if (createdId) info(`Note: test workflow ${createdId} may still exist in n8n — delete it manually if needed.`);
    process.exit(1);
  }
}

main();
