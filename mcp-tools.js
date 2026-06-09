const fs = require('fs');
async function run() {
  const env = fs.readFileSync('.env.local', 'utf-8');
  const url = env.match(/N8N_MCP_URL=(.*)/)[1].trim();
  const token = env.match(/N8N_MCP_TOKEN=(.*)/)[1].trim();
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
  });
  const text = await res.text();
  try {
    const data = JSON.parse(text.replace(/^data: /m, ''));
    console.log(data.result.tools.map(t => t.name).join(', '));
  } catch (e) {
    console.log(text);
  }
}
run();
