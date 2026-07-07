# Workflow-Templates: Katalog & Einbindung

## MVP-Funktionalitäten-Katalog (Ziel: 10–15)

Jede Funktionalität = 1 golden Template (+ MD-Wrapper) nach dem Verfahren unten.
KI-Schritte laufen IMMER über `POST /api/agent/llm` (zentraler Mistral-Key, Credit-Abrechnung
wie der Chat, Standard-Prompts per Coach-Tool `update_agent_prompt` anpassbar).

| # | Funktionalität | Template | Status |
|---|---------------|----------|--------|
| 1 | **E-Mail-Automation** (Triage + Antwort-Entwurf, jeder Mail-Anbieter) | `email-triage-draft` | ✅ live getestet |
| 2 | **Steuerkanal WhatsApp/Slack/Teams** (Freigabe, Revision, Ad-hoc-Assistent) — EIGENE Funktionalität, wird Nutzern von #1 zusätzlich vorgeschlagen, funktioniert aber unabhängig | `whatsapp-control` | ✅ live getestet |
| 3 | **Learning Engine** (Automation lernt aus Korrekturen) | `email-learning-engine` | ✅ live getestet |
| 4 | Lead-Follow-up nach X Tagen | `lead-followup` | ✅ vorhanden |
| 5 | Terminvergabe mit Kalender-Anbindung (freie Slots vorschlagen, nie direkt buchen) | `tool_get_free_slots` + Erweiterung #1 | geplant |
| 6 | CRM-Kontext im Entwurf (Lead/Kunde? Historie? nächster Schritt?) | `tool_lookup_contact` | geplant |
| 7 | Proaktiver Monitor (offene Leads, fehlgeschlagene Workflows → Push) | `proactive-monitor` | geplant |
| 8 | Angebot aus Gesprächsnotiz/Transkript generieren | `angebot-aus-notiz` | geplant |
| 9 | Rechnungs-Eingang erfassen (Anhänge → Ablage + Buchhaltungs-Tabelle) | `rechnungs-eingang` | geplant |
| 10 | Formular-/Website-Anfragen → CRM + Antwort | `formular-zu-crm` | geplant |
| 11 | Bewertungs-Management (Google Reviews → Antwort-Entwurf) | `review-antworten` | geplant |
| 12 | Social-Media-Posting aus Content-Plan | `social-posting` | geplant |
| 13 | No-Show-Reminder (Termin-Erinnerungen per WhatsApp/SMS) | `termin-reminder` | geplant |
| 14 | Wochen-Report (KPIs aus CRM/Sheets → Zusammenfassung) | `wochen-report` | geplant |
| 15 | Dokumenten-Ablage (Anhänge klassifizieren → Drive-Ordner) | `dokumenten-ablage` | geplant |

Branchen-Varianten entstehen NICHT als neue Templates, sondern über Kategorien-Seeds +
Workspace-Regeln (siehe Variations-Achsen unten).

---

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
