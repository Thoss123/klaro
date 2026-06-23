import { describe, expect, it } from 'vitest';
import { parseMcpSearchNodesResults } from '@/lib/n8n-mcp-search';

const SAMPLE = `## "slack"
Found 2 nodes:

- n8n-nodes-base.slack
  Display Name: Slack
  Version: 2.5
  Description: Consume Slack API

- n8n-nodes-base.slackTrigger
  Display Name: Slack Trigger
  Version: 1.1
  Description: Starts the workflow when Slack events occur
`;

describe('parseMcpSearchNodesResults', () => {
  it('parst Node-Blöcke aus MCP-Text', () => {
    const entries = parseMcpSearchNodesResults(SAMPLE);
    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe('n8n-nodes-base.slack');
    expect(entries[0].displayName).toBe('Slack');
    expect(entries[0].version).toBe(2.5);
    expect(entries[1].axantiloCategory).toBe('trigger');
  });
});
