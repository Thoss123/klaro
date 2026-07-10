/**
 * Deployt die drei zusätzlichen Golden-Templates (Follow-up-Serie, Angebots-Autopilot,
 * Rechnung & Mahnwesen) als Referenz-Builds „AXANTILO-REF: <Name>" in die geteilte n8n-Instanz —
 * Struktur-Beweise mit gefüllten Slots (Gmail-Provider, Platzhalter-Skalare), zentrale Credentials
 * angehängt, Nutzer-Credentials (Gmail/Sheets/Docs OAuth) bleiben leer (kein Nutzer-Kontext).
 *
 * Aufruf: npx tsx scripts/build-golden-refs.ts --deploy   (ohne --deploy nur Trockenlauf)
 */
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const DEPLOY = process.argv.includes('--deploy');
const BASE = process.env.N8N_API_URL!;
const KEY = process.env.N8N_API_KEY!;
const REF_PREFIX = 'AXANTILO-REF: ';

const COMMON = {
  APP_BASE_URL: 'https://www.axantilo.com',
  PROJECT_ID: '00000000-0000-0000-0000-000000000000',
  PERSONA_PATH: 'rules/persona_default.md',
};

const GOLDENS: Array<{ slug: string; name: string; scalars: Record<string, string> }> = [
  { slug: 'followup-serie', name: 'Follow-up-Serie (T3/T7/T14)', scalars: { ...COMMON, FOLLOWUP_TABLE: 'followup_leads' } },
  {
    slug: 'angebot-autopilot', name: 'Angebots-Autopilot',
    scalars: {
      ...COMMON, PREISLISTE_TABLE: 'preisliste', FOLLOWUP_TABLE: 'followup_leads',
      OWNER_WHATSAPP: '+430000000000', TWILIO_WHATSAPP_FROM: '+14155238886',
      OFFER_APPROVAL_WEBHOOK_PATH: 'offer-approval-ref',
    },
  },
  {
    slug: 'rechnung-mahnwesen', name: 'Rechnung & Mahnwesen',
    scalars: {
      ...COMMON, INVOICE_TABLE: 'rechnungen', INVOICE_DOC_TEMPLATE_ID: 'REF_DOC_TEMPLATE_ID',
      ORDER_DONE_WEBHOOK_PATH: 'auftrag-fertig-ref',
    },
  },
];

async function n8n<T = Record<string, unknown>>(p: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${p}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-N8N-API-KEY': KEY, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`n8n ${init.method || 'GET'} ${p} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function upsertByName(wf: { name: string } & Record<string, unknown>): Promise<string> {
  const list = await n8n<{ data: Array<{ id: string; name: string }> }>(`/workflows?limit=200`);
  const existing = list.data.find(w => w.name === wf.name);
  if (existing) {
    await n8n(`/workflows/${existing.id}`, { method: 'PUT', body: JSON.stringify(wf) });
    return existing.id;
  }
  const created = await n8n<{ id: string }>(`/workflows`, { method: 'POST', body: JSON.stringify(wf) });
  return created.id;
}

async function main() {
  const { loadWorkflowTemplate } = await import('../lib/template-loader');
  const { buildCentralCredMap } = await import('../lib/central-credentials');
  const central = buildCentralCredMap();

  console.log('MOCK_N8N =', process.env.MOCK_N8N, '| DEPLOY =', DEPLOY);

  for (const g of GOLDENS) {
    const { workflow, credentialBindings } = loadWorkflowTemplate(g.slug, { mailProvider: 'gmail', scalars: g.scalars });
    // Zentrale Credentials (SMTP/Twilio/Workspace-Token/WhatsApp) an passende Nodes hängen;
    // Nutzer-OAuth (Gmail/Sheets/Docs) bleibt leer — REF-Build ist Struktur-Beweis.
    const byName = new Map(workflow.nodes.map(n => [n.name, n]));
    for (const b of credentialBindings) {
      const id = central[b.credentialType];
      if (!id) continue;
      const node = byName.get(b.node);
      if (!node) continue;
      node.credentials = { ...(node.credentials as Record<string, unknown> | undefined), [b.credentialType]: { id, name: b.credentialType } };
    }
    // Header-Auth (Workspace-Token) an App-HTTP-Nodes.
    const wsToken = central.httpHeaderAuth;
    if (wsToken) {
      for (const node of workflow.nodes) {
        if (node.type !== 'n8n-nodes-base.httpRequest') continue;
        const p = node.parameters as { genericAuthType?: string } | undefined;
        if (p?.genericAuthType === 'httpHeaderAuth') {
          node.credentials = { ...(node.credentials as Record<string, unknown> | undefined), httpHeaderAuth: { id: wsToken, name: 'httpHeaderAuth' } };
        }
      }
    }

    const wf = {
      name: `${REF_PREFIX}${g.name}`,
      nodes: workflow.nodes,
      connections: workflow.connections ?? {},
      settings: { executionOrder: 'v1', availableInMCP: true },
    };

    if (!DEPLOY) {
      console.log(`[Trockenlauf] ${g.slug} → ${wf.name} (${workflow.nodes.length} Nodes)`);
      continue;
    }
    const id = await upsertByName(wf);
    console.log(`✓ ${g.slug} → ${wf.name} (n8n id: ${id})`);
  }
}

main().catch(e => { console.error('FAILED:', e instanceof Error ? e.message : String(e)); process.exit(1); });
