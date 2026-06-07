import fs from 'fs';
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}
process.env.MOCK_N8N = 'false';

const { n8nMcpCall } = await import('../lib/n8n-mcp-bridge.ts');

const code = `import { workflow, node, trigger } from '@n8n/workflow-sdk';
const start = trigger({ type: 'n8n-nodes-base.webhook', version: 2, config: { name: 'Webhook', parameters: { httpMethod: 'POST', path: 'klaro-test' } } });
const setNode = node({ type: 'n8n-nodes-base.set', version: 3, config: { name: 'Set', parameters: { mode: 'manual' } } });
export default workflow('klaro-test', 'KLARO: Test').add(start).to(setNode);`;

const r = await n8nMcpCall('validate_workflow', { code });
console.log(JSON.stringify(r, null, 2));
