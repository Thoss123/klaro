---
type: template_workflow
use_cases: [telegram-steuerkanal, freigabe-per-chat, chef-assistent, multimodaler-router]
tools_required: [telegram, gmail]
n8n_json_file: telegram-control.json
---

> **WICHTIG — noch kein `.json` vorhanden:** Diese Datei ist NUR die Slot-/Ketten-Spezifikation.
> Die golden `telegram-control.json` MUSS wie alle anderen Templates in n8n gebaut, live
> getestet und dann exportiert/eingefroren werden (siehe `knowledge/templates/README.md`) —
> **niemals LLM-generiert**. Bis dahin ist `lib/bernd/templates.ts` der einzige Verweis
> (Manifest-Eintrag), `lib/template-loader.ts` wirft beim Laden, solange die JSON fehlt.

# Steuerkanal: Telegram (Bernds multimodaler Router-Eingang)

## Beschreibung
Sibling von [whatsapp-control.md](whatsapp-control.md) — gleiche Rollen (Freigabe, Revision,
Ad-hoc-Assistent), aber als **geteilter** Bot für alle Bernd-Betriebe (Mandanten-Routing über
`chat_id → project_id`, Tabelle `bernd_channel_links`) statt eines dedizierten WhatsApp-Sandbox-
Kanals pro Betrieb. Zusätzlich der **Eingangspunkt für multimodalen Input** (Text/Sprache/Foto),
den der WhatsApp-Kanal nicht abdeckt.

Anders als beim WhatsApp-Steuerkanal liegt das **komplette Reasoning bereits in der App**
(`POST /api/bernd/router` — Mandanten-Auflösung, Konversations-Memory, HITL-Klassifizierung,
Mistral-Function-Calling-Loop mit Arbeits- und Konfig-Tools). Der n8n-Flow selbst ist bewusst
dünn: Kanal-I/O (Empfangen, Medien laden, Senden) + ein Routing-Switch auf die vom
App-Endpoint zurückgegebenen `directives`. Siehe Architekturplan §2 für die volle Begründung
(geteilter Bot ⇒ keine statische Per-Mandant-LLM-Credential im nativen n8n-Agent-Node möglich).

## Kette
```
Telegram Trigger (geteilter Bot, zentrale Credential)
  → Switch: message.voice | message.photo | message.text
      voice → getFile (Telegram) → HTTP POST /api/bernd/media { kind:'voice', file_base64 }
      photo → getFile (Telegram) → HTTP POST /api/bernd/media { kind:'photo', file_base64 }
      text  → direkt weiter (kein Media-Call)
  → Code: normalisieren → { chat_id, text, media_kind }
  → HTTP POST /api/bernd/router { chat_id, text, media_kind, project_id? }
       → { directives: RouterDirective[], text }
  → Switch auf directives[].kind
      reply        → Telegram sendMessage (chat_id, text)
      trigger_flow → Execute Sub-Workflow / HTTP-Webhook des Ziel-Flows (flow_slug, args)
      config       → Telegram sendMessage (Bestätigungstext aus dem Konfig-Tool)
```

Die HITL-Verifikation (offener `pending`? Bestätigung/Revision/neu?) sowie die Konfig-Tools
(`set_price_param`, `set_notify_rule`, `toggle_flow`, `update_bernd_knowledge`) laufen
vollständig im App-Endpoint (`lib/bernd/router-tools.ts` + `lib/bernd/config-tools.ts`) — der
n8n-Flow muss davon nichts wissen, er reicht nur `directives` an die passenden Sende-/Trigger-
Nodes durch.

## Unterschiede zu whatsapp-control
- **`contact`/Mandanten-Schlüssel** = Telegram `chat_id` (numerisch/string), nicht Twilio-
  `From`-Format (`whatsapp:+43…`).
- **Pairing statt Sandbox-Join**: `chat_id` wird per Deep-Link + Code verknüpft
  (`bernd_channel_links.pairing_code` → `/start <code>` im Bot → `verified_at` gesetzt),
  kein manuelles `join <code>` an eine Sandbox-Nummer.
- **Ein Bot für alle Mandanten**: die Mandanten-Auflösung (`chat_id → project_id`) passiert
  im App-Endpoint, nicht über separate n8n-Workflows pro Betrieb.
- **Multimodal von Haus aus**: Sprachnachrichten (Voxtral-Transkription) und Fotos
  (Mistral-OCR) laufen über denselben `/api/bernd/media`-Zwischenschritt, bevor der Text den
  Router erreicht — WhatsApp-control kennt bisher nur Text.

## Slots
- `{{CONTROL_WEBHOOK_PATH}}` — Webhook-Pfad dieses Flows (Telegram-Webhook-URL-Segment)
- `{{PROJECT_ID}}` — nur als Fallback/Debug-Skalar; die eigentliche Mandanten-Auflösung
  passiert laufzeitseitig über `chat_id` (siehe oben), nicht über einen festen Slot-Wert
- `{{APP_BASE_URL}}` — Basis-URL für `/api/bernd/media` + `/api/bernd/router`
- `{{BOT_TOKEN_CRED}}` — n8n-Credential-Name/-ID des zentralen Telegram-Bot-Tokens
  (zentrale Credential, analog `N8N_CREDENTIAL_TWILIO` — nie user-sichtbar)

## Einrichtung (einmalig, pro Axantilo-Instanz — NICHT pro Betrieb)
1. Bot bei **BotFather** anlegen (`/newbot`), Token in n8n als zentrale Telegram-API-Credential
   hinterlegen (`{{BOT_TOKEN_CRED}}`).
2. Workflow aktivieren → Telegram-Webhook-URL: `https://<n8n-host>/webhook/{{CONTROL_WEBHOOK_PATH}}`.
3. Webhook bei Telegram registrieren: `setWebhook` (entweder automatisch über den n8n-Telegram-
   Trigger-Node beim Aktivieren, oder manuell via `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<n8n-webhook-url>`).
4. Bot-Username in `NEXT_PUBLIC_TELEGRAM_BOT` (App-Env) eintragen — die Dashboard-Pairing-Karte
   (`components/bernd/PairingCard.tsx`) baut daraus den Deep-Link `t.me/<bot>?start=<code>`.

## Stolperfallen (erwartet — noch nicht live verifiziert, siehe Hinweis oben)
- Telegram-`getFile` liefert nur einen relativen `file_path` — die tatsächliche Download-URL
  ist `https://api.telegram.org/file/bot<TOKEN>/<file_path>`; Download muss vor dem Base64-
  Encoding für `/api/bernd/media` passieren (Bot-Token bleibt dabei in n8n, nie in der App).
- Telegram-Voice-Notes kommen als `.oga` (Opus/Ogg) — `/api/bernd/media` erwartet `mime`
  passend mitzuschicken, Voxtral akzeptiert Ogg/Opus nativ (kein Transcode nötig, siehe
  bestehende Praxis in `app/api/transcribe/route.ts`).
- Ein geteilter Bot bedeutet: **jede** eingehende `chat_id` muss zuerst gegen
  `bernd_channel_links` aufgelöst werden, bevor irgendein Betriebs-Wissen/Flow berührt wird —
  fehlt die Zuordnung, antwortet der Router mit dem Pairing-Hinweis statt mit Firmenwissen.
