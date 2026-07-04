# Prompt-Assembly — Doku

Der System-Prompt wird **pro Request** dynamisch assembliert. Es gibt keinen
statischen Coach-Prompt mehr — `coach/prompts/base.md` ist das Template, in
das drei Dinge eingesetzt werden.

## Reihenfolge (fix)

```
1. BASE            coach/prompts/base.md (Identität, Modus-Regel, Guardrails)
2. PHASENMODUL     coach/prompts/phase_{X}.md  → ersetzt {{phase_module}}
3. STATE           "AKTUELLER STATE:" + State-JSON → ersetzt {{state_json}}
4. RAG-CHUNKS      "WISSENSKONTEXT:" + 3–5 Chunks → ersetzt {{rag_chunks}}
```

Die Labels „AKTUELLER STATE:" und „WISSENSKONTEXT:" stehen bereits in
`base.md` — der Assembler ersetzt nur die drei Platzhalter. Bei jedem
Phasenwechsel wird das Modul **komplett ausgetauscht**, nie ergänzt.

**Tool-Definitionen kommen NICHT in den Prompt-Text.** Sie gehen über den
`tools`-Parameter des Mistral-API-Calls — und zwar nur die Tools, die
`coach/config/phases.json` für die aktive Phase erlaubt (plus `phase_advance`
aus `global_tools`). Ein Tool, das die Phase nicht erlaubt, existiert für das
Modell schlicht nicht.

## Kontext-Budget

| Baustein            | Ziel        |
|---------------------|-------------|
| Base                | ~1,5k Tokens |
| Phasenmodul         | ~1,5k Tokens |
| State-JSON          | ~1k Tokens  |
| RAG-Chunks (3–5)    | ~2k Tokens  |
| Tool-Definitionen   | ~1k Tokens (API-seitig) |
| **Fixkosten**       | **~7k**     |
| History (komprimiert + aktive Phase roh) | Rest |
| **Ziel pro Request**| **< 15k**   |

---

## Vollständiges Beispiel (Phase 1a)

### Eingaben

**Beispiel-State** (aus Supabase, `sessions.state`):

```json
{
  "session_id": "a1b2c3d4",
  "phase": "1a",
  "mode": "fuehren",
  "intent_history": [{ "typ": "C", "notiz": "kam skeptisch, Datenschutz früh erwähnt", "zeitpunkt": "2026-07-02T09:14:00Z" }],
  "company": { "name": null, "groesse": "2-5", "objekte_aktiv": 30, "anfragen_pro_woche": 40, "team_notizen": "Assistentin macht Besichtigungstermine" },
  "stack": { "crm": null, "portale": ["willhaben", "immoscout"], "postfach": "gmail", "kalender": null, "fehlend": [] },
  "pains": [{ "text": "Portalanfragen fressen jeden Vormittag", "quelle": "user", "prio": 1 }],
  "einwaende": [{ "typ": "datenschutz", "status": "offen", "loesung": null }],
  "selected_workflows": [],
  "variables": {},
  "connections": [],
  "deploys": [],
  "credits": { "kontingent": 500, "verbraucht": 0 },
  "zusammenfassung_bestaetigt": false,
  "kunde_bereit": false,
  "readiness": false,
  "offene_todos": []
}
```

**RAG-Query:** Embedding der letzten User-Message, gefiltert auf die Scopes
von Phase 1a (`einwand`, `usecase`, `branche_makler` — aus phases.json).
Zwei Beispiel-Chunks aus dem Ergebnis:

```
[Chunk 1 — scope: einwand | datei: rag/einwaende/datenschutz.md]
Datenschutz-Einwand: Alle Daten werden in der EU gehostet (Supabase EU,
n8n auf EU-VPS). Verarbeitung DSGVO-konform, AVV wird auf Wunsch gestellt.
KI-Verarbeitung über EU-Anbieter. Kurzantwort für den Coach: „Alles läuft
auf EU-Servern, DSGVO-konform, und einen Auftragsverarbeitungsvertrag
bekommst du von uns — soll ich dir die Details schicken?"

[Chunk 2 — scope: usecase | datei: rag/usecases/portalanfragen.md]
Use-Case Portalanfragen: Makler mit 20–50 Objekten erhalten typischerweise
30–60 Anfragen/Woche über Portale. 80 % stellen dieselben Fragen
(Verfügbarkeit, Besichtigung, Unterlagen). Status: verfuegbar.
```

### Assemblierter Prompt (Struktur)

```
┌─ SYSTEM-PROMPT ──────────────────────────────────────────────┐
│ [gesamter Inhalt von base.md bis zum Platzhalter:            │
│  Identität, Modus-Regel, Guardrails 1–6, Arbeitsgrundlage]   │
│                                                              │
│ [anstelle von {{phase_module}}:                              │
│  gesamter Inhalt von phase_1a_fuehren.md]                    │
│                                                              │
│ ---                                                          │
│                                                              │
│ AKTUELLER STATE:                                             │
│ { "session_id": "a1b2c3d4", "phase": "1a", "mode": "fuehren",│
│   ... (das komplette State-JSON von oben) }                  │
│                                                              │
│ WISSENSKONTEXT:                                              │
│ [Chunk 1 — Datenschutz-Einwand …]                            │
│ [Chunk 2 — Use-Case Portalanfragen …]                        │
└──────────────────────────────────────────────────────────────┘

API-Call zusätzlich:
  tools = [state_update, rag_query, phase_advance]   ← nur Phase-1a-Tools!
  messages = [
    { role: "assistant"/"user": komprimierte Zusammenfassung Phase 0
      (3–5 Sätze, als erster Kontext-Turn) },
    ...rohe Turns der laufenden Phase 1a...,
    { role: "user", content: <neue User-Message> }
  ]
```

`workflow_instantiate` ist in diesem Call **nicht vorhanden** — der Coach
kann in Phase 1a physisch nicht deployen.

---

## Orchestrator-Flow (n8n) — Pseudocode

```
ON user_message(session_id, text):

  # 1. State laden
  state = supabase.sessions.get(session_id).state
  if state is null: state = init_state(session_id)   # phase="0", mode=null

  # 2. Phasenmodul wählen
  phase_cfg = phases_json[state.phase]
  module    = read(f"coach/prompts/phase_{state.phase}.md")

  # 3. RAG mit Phase-Scope
  chunks = []
  if phase_cfg.rag_scopes:
    chunks = pgvector.match(embed(text), scopes=phase_cfg.rag_scopes, top_k=5)

  # 4. Prompt assemblieren
  prompt = base_md
             .replace("{{phase_module}}", module)
             .replace("{{state_json}}", json(state))
             .replace("{{rag_chunks}}", render(chunks))
  tools  = tool_defs(phase_cfg.tools + phases_json.global_tools)

  # 5. LLM-Call
  history  = load_history(session_id)   # Zusammenfassungen alter Phasen + rohe Turns der aktiven
  response = mistral.chat(system=prompt, messages=history + [user(text)], tools=tools)

  # 6. Antwort verarbeiten
  for call in response.tool_calls:
    if call.name == "phase_advance":
      target = call.args.to
      if target not in phase_cfg.exit_to:
        inject_hint(response, f"Übergang nach {target} nicht vorgesehen")
      elif not check_exit(phase_cfg.exit_check, state, target):   # CODE prüft, nie das LLM
        inject_hint(response, f"Noch nicht erfüllt: {missing_conditions(...)}")
      else:
        # Phasenwechsel
        summary = mistral.chat(util_history_compress_md, turns=raw_turns_of(state.phase))
        replace_history(session_id, state.phase, summary)   # rohe Turns → 3–5 Sätze
        state.phase = target
        if target == "1b" and came_from == "5":              # Kreislauf-Wiedereintritt
          state.zusammenfassung_bestaetigt = false
          state.readiness = false
        if target == "2":                                     # Connect-Verkürzung
          mark_already_verified_connections(state)            # verified bleibt verified,
                                                              # Coach bestätigt nur kurz
    else:
      result = execute_tool(call)        # n8n-Subflows: oauth, test, deploy, …
      feed_back_to_llm_if_needed(result)

  # State-Extraktion (eigener, kleiner LLM-Call)
  delta = mistral.chat(util_state_extraction_md, state=state, turns=[user(text), response.text])
  state = merge(state, delta)            # Arrays über Schlüsselfelder mergen
  validate(state, state_schema_json)     # ungültige Deltas verwerfen + loggen
  supabase.sessions.update(session_id, state)

  # 7. Antwort ans Frontend
  return response.text
```

Kernpunkte:

- **Der Orchestrator ist der Türsteher.** `phase_advance` ist ein Wunsch des
  Modells; `check_exit()` entscheidet in Code gegen `phases.json` +
  `state_schema.json`. Abgelehnter Übergang → der Coach bekommt im nächsten
  Kontext einen Hinweis, was fehlt.
- **History-Kompression an Phasengrenzen:** rohe Turns der abgeschlossenen
  Phase werden durch die 3–5-Satz-Zusammenfassung (util_history_compress)
  ersetzt. Fakten trägt der State, die Zusammenfassung trägt Verlauf + Ton.
- **Phase 5 → 1b (Kreislauf):** kein neuer Chat, kein Reset. State bleibt,
  `zusammenfassung_bestaetigt`/`readiness` werden zurückgesetzt (gelten pro
  Durchlauf), bereits `verified` Connections werden in Phase 2 nur bestätigt.

---

## Neue Workflows hinzufügen — ohne Prompt-Change

Die Phasenmodule kennen **keinen einzigen Workflow-Namen** und keine Anzahl.
Sie sagen generisch „hol dir die Workflows aus dem Wissenskontext"
(`rag_query` scope=workflow) bzw. „lade das Schema des gewählten Workflows"
(`template_schema_load(wf_id)`). Deshalb braucht ein neuer Workflow (z. B.
„Rechnung & Provision") genau drei Daten-Artefakte und **null**
Prompt-Änderungen:

1. **RAG-Datei** `rag/workflows/{wf_id}.md` — Beschreibung, was er tut / was
   NICHT, Credits-Schätzung, Status-Flag `verfuegbar`/`bald`. Damit findet
   Phase 1b ihn und kann ihn ehrlich anbieten (Guardrail 1 liest das
   Status-Flag).
2. **Template + Schema** `coach/templates/{wf_id}.json` (n8n-JSON mit
   `{{var}}`-Platzhaltern) und `coach/templates/{wf_id}.schema.json`
   (Variablen-Schema mit `default` + `beschreibung_fuer_coach` — daraus baut
   Phase 3 ihre Default-Vorschläge).
3. **Ein Eintrag** in `coach/config/workflows_index.json` (id, bereich,
   status, Pfade) — die einzige Stelle, die angefasst wird, und sie ist
   Daten, kein Prompt. Der Orchestrator liest daraus, welche Tools/
   Verbindungen der Workflow braucht (für das Phase-2-Gate).

Danach: RAG neu indexieren — fertig. Kein Modul, keine phases.json, kein
Base-Prompt wird angefasst. **Regel für alle künftigen Prompt-Edits:** taucht
in einem Phasenmodul je ein konkreter Workflow-Name oder eine Anzahl („die 9
Workflows") auf, ist das ein Bug.
