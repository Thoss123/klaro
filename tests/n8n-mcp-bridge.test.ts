import { describe, expect, it } from 'vitest';
import { buildTriggerPinData } from '@/lib/n8n-mcp-bridge';

describe('buildTriggerPinData', () => {
  it('pinnt NUR Trigger-Nodes — Action-/Credential-Nodes laufen echt', () => {
    const pin = buildTriggerPinData([
      { name: 'Manueller Start Trigger', type: 'n8n-nodes-base.manualTrigger' },
      { name: 'Kundendaten Airtable abrufen', type: 'n8n-nodes-base.airtable' },
      { name: 'E-Mail senden', type: 'n8n-nodes-base.gmail' },
      { name: 'Ergebnis ausgeben', type: 'n8n-nodes-base.set' },
    ]);

    // Nur der Trigger ist gepinnt → Airtable/Gmail/Set werden real ausgeführt.
    expect(pin).toEqual({ 'Manueller Start Trigger': [{ json: {} }] });
    expect(pin).not.toHaveProperty('Kundendaten Airtable abrufen');
    expect(pin).not.toHaveProperty('E-Mail senden');
  });

  it('erkennt verschiedene Trigger-Typen (schedule, webhook, formTrigger, chatTrigger)', () => {
    const pin = buildTriggerPinData([
      { name: 'Zeitplan', type: 'n8n-nodes-base.scheduleTrigger' },
      { name: 'Webhook', type: 'n8n-nodes-base.webhook' },
      { name: 'Formular', type: 'n8n-nodes-base.formTrigger' },
      { name: 'Chat', type: '@n8n/n8n-nodes-langchain.chatTrigger' },
    ]);

    expect(Object.keys(pin).sort()).toEqual(['Chat', 'Formular', 'Webhook', 'Zeitplan']);
    for (const rows of Object.values(pin)) {
      expect(rows).toEqual([{ json: {} }]);
    }
  });

  it('liefert leeres Objekt, wenn kein Trigger dabei ist oder Felder fehlen', () => {
    expect(buildTriggerPinData([{ name: 'Set', type: 'n8n-nodes-base.set' }])).toEqual({});
    expect(buildTriggerPinData([{ type: 'n8n-nodes-base.manualTrigger' }])).toEqual({});
    expect(buildTriggerPinData([{ name: 'X' }])).toEqual({});
    expect(buildTriggerPinData([])).toEqual({});
  });
});
