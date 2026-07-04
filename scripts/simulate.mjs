// Drive a coaching simulation against the running dev server.
//
// This is invoked BY Claude Code as part of the /simulate-coaching skill:
//   1. Claude runs `--persona X` → Mistral simulates → packet written to a file.
//   2. Claude READS that packet, judges the transcript against the rubric.
//   3. Claude runs `--judge <runId> --findings <file>` → verdict is finalized.
//
// Usage (dev server must be running — `npm run dev`):
//   node scripts/simulate.mjs --persona profil-2 [--phases diagnose,analyse] [--out path.json]
//   node scripts/simulate.mjs --resume <runId> --after analyse        # redo phase 3 only
//   node scripts/simulate.mjs --judge <runId> --findings verdict.json # record Claude's verdict
//   node scripts/simulate.mjs --seed                                  # upsert seed personas
//   node scripts/simulate.mjs --aggregate                             # build improvement report

import fs from 'fs';
import path from 'path';
import os from 'os';

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
const flag = (name) => process.argv.includes(`--${name}`);

const BASE = process.env.SIM_BASE_URL || 'http://localhost:3000';

async function post(pathname, body) {
  const res = await fetch(`${BASE}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`✗ ${pathname} → ${res.status}:`, data.error || data);
    process.exit(1);
  }
  return data;
}

async function main() {
  if (flag('seed')) {
    const d = await post('/api/dev/simulations', { action: 'seed' });
    console.log(`✓ Seeded ${d.seeded} personas.`);
    return;
  }
  if (flag('aggregate')) {
    const d = await post('/api/dev/simulations/improve', { action: 'aggregate' });
    console.log(`✓ Aggregated ${d.clusters} improvement cluster(s) from ${d.runsScanned} run(s).`);
    return;
  }

  // Import a finished run into a real chat session for the test user, so it can
  // be opened + continued in the normal chat UI.
  const importRunId = arg('import');
  if (importRunId) {
    const userId = arg('user');
    const d = await post(`/api/dev/simulations/${importRunId}/import`, userId ? { userId } : {});
    console.log(`✓ Imported run into a chat session (${d.messageCount} messages, phase ${d.phase}).`);
    console.log(`  open & continue here: ${d.url}`);
    return;
  }

  // Step 3: record Claude Code's verdict.
  const judgeRunId = arg('judge');
  if (judgeRunId) {
    const findingsPath = arg('findings');
    if (!findingsPath || !fs.existsSync(findingsPath)) {
      console.error('Need --findings <path to JSON array of verdicts>.');
      process.exit(1);
    }
    const findings = JSON.parse(fs.readFileSync(findingsPath, 'utf-8'));
    const d = await post(`/api/dev/simulations/${judgeRunId}/judge`, { findings });
    console.log(`✓ Judgment recorded — score ${d.verdict.score} (${d.verdict.pass ? 'PASS' : 'FAIL'}), ${d.failedFindings} failed finding(s).`);
    console.log(`  view: ${BASE}/dev/simulations/${judgeRunId}`);
    return;
  }

  // Step 1: simulate (Mistral). Writes the judge packet for Claude to read.
  const persona = arg('persona');
  const resume = arg('resume');
  const after = arg('after');
  const phases = arg('phases')?.split(',').map(s => s.trim()).filter(Boolean);
  if (!persona && !resume) {
    console.error('Need --persona <slug> (or --resume <runId> --after <phase>).');
    process.exit(1);
  }

  console.log(`▶ Simulating ${persona ?? `resume ${resume}`} … (Mistral, can take a few minutes)`);
  const d = await post('/api/dev/simulations', {
    persona,
    phases,
    resume: resume ? { runId: resume, afterPhase: after } : undefined,
  });
  const p = d.packet;
  const outPath = arg('out') || path.join(os.tmpdir(), `sim-packet-${p.runId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(p, null, 2));

  console.log(`✓ Simulation done — run ${p.runId}`);
  console.log(`  phases: ${p.phasesRun.join(' → ')}`);
  if (p.stalledPhases.length) console.log(`  ⚠ stalled (hit turn cap): ${p.stalledPhases.join(', ')}`);
  console.log(`  mechanical: ${p.mechanicalFindings.filter(f => !f.passed).length} failed / ${p.mechanicalFindings.length}`);
  console.log(`  ▸ JUDGE PACKET written to: ${outPath}`);
  console.log(`  ▸ Claude Code: read that file, judge the rubric, then run:`);
  console.log(`    node scripts/simulate.mjs --judge ${p.runId} --findings <your-verdict.json>`);
}

main().catch(e => { console.error(e); process.exit(1); });
