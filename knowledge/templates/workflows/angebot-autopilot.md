---
type: template_workflow
use_cases: [angebots-autopilot, anfragen-automatisieren]
tools_required: [gmail, twilio]
n8n_json_file: angebot-autopilot.json
---

# Angebots-Autopilot (Anfrage rein, Angebot raus)

## Beschreibung
Bei jeder eingehenden Angebotsanfrage (Mail): Kundendaten und gewünschte Leistung extrahieren,
passende Preise aus der Preisliste ziehen, einen fertigen Angebotstext formulieren, zur
Freigabe per WhatsApp vorlegen und erst nach „SENDEN" tatsächlich verschicken. Danach wird der
Vorgang in der Datenablage mit `offer_sent_at` markiert, damit die
**Lead-Follow-up-Serie** (`followup-serie.md`) das Angebot automatisch nachfassen kann, falls
der Kunde nicht antwortet.

## Architektur (wichtig)
Beide KI-Schritte laufen über `POST {{APP_BASE_URL}}/api/agent/llm` — kein eigener Mistral-Node,
Credit-Abrechnung wie im Chat:
- `offer/extract` (`lib/agent-prompts.ts`) — liest Kundenname, gewünschte Leistung,
  Budget-Hinweis und Kontakt-E-Mail strukturiert aus der Anfrage (JSON-Mode).
- `offer/draft` — formuliert daraus, zusammen mit der Preisliste aus der Datenablage
  (`{{preisliste}}`-Variable), den fertigen Angebotstext. Nennt NUR Leistungen/Preise aus der
  Preisliste, erfindet nichts dazu (siehe Prompt-Regeln).

Preise/Leistungen liegen standardmäßig in der Axantilo-**Datenablage**
(`knowledge/templates/bausteine/datenablage-api.md`, Tabelle `{{PREISLISTE_TABLE}}`) — kein
Setup für den Nutzer nötig. **Alternative**: Hat der Nutzer bereits eine Preisliste in Google
Sheets oder einem CRM, kann „Preisliste lesen" durch einen `googleSheets`- bzw.
`{{CRM_NODE}}`-Node (siehe `lib/template-loader.ts`, `CRM_PROVIDER_NODES`) ersetzt werden — der
golden Default bleibt aber die Datenablage, weil sie ohne Nutzer-Setup sofort funktioniert.

Freigabe läuft über den **Human-in-the-Loop-Baustein**
(`knowledge/templates/bausteine/human-in-the-loop.md`): Entwurf → `agent_pending_actions`
(`POST /api/agent/pending`) → WhatsApp-Benachrichtigung → Antwort „SENDEN"/Feedback über einen
eigenen Freigabe-Webhook (analog zum Steuerkanal in `whatsapp-control.md`, aber mit
angebotsspezifischem Payload: Datenablage-Zeile wird nach dem Versand mit `offer_sent_at`
aktualisiert, was `whatsapp-control` generisch nicht kennt).

## Kette
1. Neue Anfrage (`{{TRIGGER_NODE}}`, Mail — Formular-Alternative siehe unten)
2. KI: Anfrage extrahieren (`offer/extract`) → Extraktion parsen (Code, sicheres JSON-Parsen)
3. Preisliste lesen (Datenablage `op=select`) → Preisliste zusammenfassen (Code)
4. KI: Angebot entwerfen (`offer/draft`, `{{preisliste}}` + Kundendaten)
5. Anfrage in Datenablage speichern (`op=insert`, Status `entwurf`) → Freigabe anlegen
   (`POST /api/agent/pending`) → WhatsApp: Angebot zur Freigabe
6. **Zweiter Einstiegspunkt** — Freigabe-Antwort (WhatsApp, eigener Webhook) → Antwort lesen →
   offene Freigabe suchen → Freigegeben?
   - Ja: Angebot senden (`{{SEND_NODE}}`) → Freigabe abschließen → Anfrage als versendet
     markieren (`offer_sent_at` setzen, Status `offen` — ab jetzt follow-up-fähig) →
     WhatsApp: Gesendet
   - Nein (Feedback): KI: Angebot überarbeiten (`offer/draft` erneut, mit Feedback) → Freigabe
     aktualisieren (Entwurf + Feedback-Verlauf) → WhatsApp: Neuer Entwurf (beliebig oft
     wiederholbar, wie bei `whatsapp-control`)

## Trigger-Alternative: Formular statt Mail
Der golden Default ist der Mail-Provider-Slot (`{{TRIGGER_NODE}}`/`{{SEND_NODE}}`, gmail/
outlook/imap — aufgelöst durch `lib/template-loader.ts`, `MAIL_PROVIDER_NODES`). Kommen
Anfragen stattdessen über ein Website-Formular rein, `{{TRIGGER_NODE}}` durch einen
`n8n-nodes-base.formTrigger` ersetzen (liefert die Formularfelder statt E-Mail-Header/Body —
„KI: Anfrage extrahieren" bekommt dann den zusammengesetzten Formulartext als `user`); der Rest
der Kette bleibt unverändert. `{{SEND_NODE}}` (Versand des fertigen Angebots) bleibt in jedem
Fall ein Mail-Provider.

## Slots
- `{{TRIGGER_NODE}}` / `{{SEND_NODE}}` — Mail-Provider (gmail/outlook/imap; Formular-Trigger
  siehe oben als manueller Tausch)
- `{{APP_BASE_URL}}`, `{{PROJECT_ID}}`, `{{PERSONA_PATH}}`
- `{{PREISLISTE_TABLE}}` — logischer Tabellenname der Preisliste in der Datenablage (Default
  `preisliste`; erwartete Zeilenform: `{ data: { leistung, preis, einheit?, hinweis? } }`)
- `{{FOLLOWUP_TABLE}}` — logischer Tabellenname für die Angebots-/Lead-Zeile (Default
  `followup_leads`, geteilt mit `followup-serie`, damit dieselbe Zeile dort weiterläuft)
- `{{OWNER_WHATSAPP}}` (nackte Nummer), `{{TWILIO_WHATSAPP_FROM}}` (Sandbox: `+14155238886`)
- `{{OFFER_APPROVAL_WEBHOOK_PATH}}` — Webhook-Pfad des Freigabe-Einstiegspunkts dieses Flows

## Voraussetzungen
- Mail-Provider verbunden (Gmail = zentrale 3-Klick-OAuth)
- HTTP-Header-Auth-Credential `Authorization: Bearer <WORKSPACE_API_TOKEN>` an allen App-HTTP-Nodes
- Twilio zentral (Axantilo) — kein Nutzer-Setup
- Preisliste in der Datenablage hinterlegt (Tabelle `{{PREISLISTE_TABLE}}`) — sonst fragt der
  Angebotstext transparent nach, statt Preise zu erfinden
- Workspace-Regeln existieren (`ensureBaseRules` legt company_base beim Onboarding an)

## Nach dem Deployment
- Credentials prüfen, Twilio-Webhook für `{{OFFER_APPROVAL_WEBHOOK_PATH}}` in der Twilio
  Console hinterlegen (analog zu `whatsapp-control.md`), Testlauf mit gepinntem Trigger
  (Preisliste-Antwort im Test mit 1-2 Beispiel-Zeilen pinnen, NIE Credential-/Send-Nodes),
  dann aktivieren.
- `followup-serie` zusätzlich einrichten, damit unbeantwortete Angebote automatisch nachgefasst
  werden (teilt sich `{{FOLLOWUP_TABLE}}` mit diesem Workflow).

## Grenzen
Individuelle Sonderkalkulationen (starke Abweichung von der Preisliste) gehören weiterhin zur
manuellen Freigabe/Anpassung im Entwurf, nicht in den Automatik-Modus. Rechtlich bindende
Klauseln (AGB, Gewährleistung) sollten aus einer festen Vorlage stammen, nie von der KI frei
formuliert werden (siehe `knowledge/templates/documents/angebot-vorlage.md`).
