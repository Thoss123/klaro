# Neue Workflow-Templates einbinden

So kommt ein neuer Workflow von der Idee bis zum wiederverwendbaren, deploybaren Template.
Kernprinzip: **1 geprüftes Skelett, nicht N Varianten.** Ein Workflow wird EINMAL in n8n
gebaut + getestet, als „golden" JSON eingefroren, und danach nur über definierte **Slots**
variiert — nie per LLM neu generiert.

## Ordnerstruktur
```
knowledge/templates/
  workflows/<slug>.json   ← golden n8n-Export (Build-Artefakt, Slots als {{…}} markiert)
  workflows/<slug>.md     ← Wrapper: Frontmatter fürs RAG + Slot-Doku
  bausteine/<name>.md     ← wiederverwendbare Teilstücke (human-in-the-loop, rules-loader, …)
```

## Die 9 Schritte

1. **In n8n bauen + testen (Qualitäts-Gate).** Workflow im echten n8n-UI zusammenklicken und mit
   echten Daten testen. Beim Testlauf **nur den Trigger pinnen**, nie Credential-/Action-Nodes
   (sonst leerer Output). Läuft er → **als JSON exportieren**. Der n8n-Export ist garantiert valide;
   handgeschriebene/LLM-JSON ist es nicht — deshalb NIE LLM-generierte n8n-JSON deployen.
2. **Golden JSON committen:** Export 1:1 nach `knowledge/templates/workflows/<slug>.json`.
3. **Slots markieren** in der JSON — nur die Variations-Punkte:
   - `{{TRIGGER_NODE}}` / `{{SEND_NODE}}` — Mail-Provider (Gmail/Outlook/IMAP), als Node-`type`
   - `{{CRM_NODE}}` — CRM (HubSpot/Pipedrive/Salesforce/Zoho), als Node-`type`
   - `{{KATEGORIEN}}`, `{{ABSENDER_NAME}}`, `{{FREIGABE_KANAL}}`, … — Skalare in Parameter-Strings
   Der Rest bleibt eingefroren.
4. **MD-Wrapper schreiben:** `<slug>.md` mit Frontmatter + Prosa (Beschreibung, Voraussetzungen,
   welche Slots wie gefüllt werden). Die MD geht ins RAG, die JSON ist reines Artefakt.
   ```
   ---
   type: template_workflow
   use_cases: [eingehende-mails-beantworten]
   tools_required: [gmail, google-calendar]
   n8n_json_file: <slug>.json
   ---
   ```
5. **Registry ergänzen** (nur bei neuen Nodes): `NODE_MAP` in `lib/node-map.ts` + `NODE_TYPE`/
   `CREDENTIAL_TYPE` in `lib/workflow-generator.ts`. Neue Provider-Varianten zusätzlich in den
   Swap-Tabellen `MAIL_PROVIDER_NODES` / `CRM_PROVIDER_NODES` in `lib/template-loader.ts`.
   Zentrale Credentials (SMTP/Twilio/WhatsApp) stehen schon in `lib/central-credentials.ts`.
6. **Re-Index:** `npx tsx scripts/reindex-node-map.ts`. Nur `.md` wird indexiert — die `.json`
   ist Artefakt und wird vom Loader (`lib/template-loader.ts`) direkt von Disk gelesen.
7. **Retrieval prüfen:** Findet der Coach das Template? `search_knowledge({ types: ['template_workflow'] })`
   greift in den Phasen `analyse`/`umsetzung`.
8. **Deploy testen:** erst `MOCK_N8N=true` lokal, dann echt gegen den VPS. Die Deploy-Route
   `app/api/n8n/workflows` validiert Struktur + SDK, bevor sie n8n aufruft.
9. **Test committen:** `tests/template-<slug>.test.ts` — golden JSON durch `applySlots()` mit
   Beispiel-Slots → erwartete Node-/Connection-Struktur, keine `{{…}}`-Reste.

## Slots füllen (Code)
`lib/template-loader.ts`:
```ts
import { loadWorkflowTemplate } from '@/lib/template-loader';

const { workflow, credentialBindings } = loadWorkflowTemplate('email-triage-draft', {
  mailProvider: 'gmail',
  crmProvider: 'hubspot',
  scalars: { KATEGORIEN: 'Spam, Rechnung, Support, Termin, Lead', ABSENDER_NAME: 'Thomas' },
});
// workflow → deploybare n8n-JSON; credentialBindings → Nodes, deren Credential der Deploy injiziert
```

## Variations-Achsen (Übersicht)
| Achse | Beispiel | Wo aufgelöst | Zeitpunkt |
|-------|----------|--------------|-----------|
| Provider | Gmail / Outlook / IMAP | Node-Swap (`{{TRIGGER_NODE}}`/`{{SEND_NODE}}`) | Build |
| CRM | HubSpot / Pipedrive / … | Node-Swap (`{{CRM_NODE}}`) | Build |
| Kanal | Entwurf / WhatsApp-Freigabe | Baustein rein/raus (`{{FREIGABE_KANAL}}`) | Build |
| Wissen | company_base + persona | Workspace-Regeln (rules-loader) | Laufzeit |
| Branche | Friseur / Anwalt | `{{KATEGORIEN}}` + Start-Rules | Onboarding |

Nur Provider/CRM/Kanal ändern die JSON. Wissen und Branche füttern nur die Regel-Dateien —
derselbe deployte Workflow verhält sich pro Kunde/Person anders, ohne neue JSON.
