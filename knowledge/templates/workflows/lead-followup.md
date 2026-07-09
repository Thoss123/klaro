---
type: template_workflow
use_cases: [lead-follow-up-automatisieren]
tools_required: [gmail]
n8n_json_file: followup-serie.json
superseded_by: followup-serie
---

# Lead-Follow-up — siehe `followup-serie`

Dieses einzelne T+3-Follow-up (eine Mail, Google Sheets als Speicher) ist durch das golden
Template **`followup-serie`** ersetzt worden (`knowledge/templates/workflows/followup-serie.md`).

`followup-serie` deckt denselben Anwendungsfall vollständiger ab: eine **dreistufige** Serie
(T3/T7/T14, individuell formulierte Nachfass-Mails statt derselben Nachricht dreimal), Zustand
in der Axantilo-Datenablage statt Google Sheets (kein Sheet-Setup nötig beim Nutzer), und KI-
Entwürfe über `POST /api/agent/llm` (prompt_key `followup/draft_stage`, Credit-Abrechnung wie
im Chat) statt einer starren Textvorlage.

Neue Deploys sollten ausschließlich `followup-serie` verwenden — dieser Eintrag bleibt nur als
Verweis für bestehende Referenzen/RAG-Treffer erhalten.
