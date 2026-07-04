# Archiv 2026-07-02 — Altes Coach-Prompt-System

Sicherung vor Umbau auf das neue phasenmodulare Coach-System (`/coach`).

## Was liegt hier

| Datei | Herkunft | Inhalt |
|---|---|---|
| `claude.ts.old-coach-prompts.bak` | Kopie von `lib/claude.ts` (Stand 2026-07-02) | `AXANTILO_PHASE_1_PROMPT`, `AXANTILO_PHASE_2_PROMPT`, `AXANTILO_PHASE_3_PROMPT`, `AXANTILO_PHASE_4_PROMPT`, `AXANTILO_SHARED_RULES` + Prompt-Assembly-Logik |

## Warum Kopie statt Verschieben

Das alte Coach-System existiert **nicht als eigene Prompt-Dateien**, sondern als
TypeScript-Konstanten in `lib/claude.ts`. Diese Datei wird von
`app/api/chat/route.ts` und weiteren Modulen importiert — sie zu verschieben
würde den Build brechen. Deshalb: vollständige Kopie hier, Original unangetastet.

Wenn das neue `/coach`-System live ist und `lib/claude.ts` abgelöst wird,
kann das Original entfernt werden — diese Sicherung bleibt.

## Nicht archiviert (bewusst)

- `lib/agents/*` (Supervisor, Workflow-QA, Topic-Research, Node-Resolver) —
  das sind Canvas-Worker-Pipeline-Agenten, kein Coach-Prompt.
- `/knowledge/*` — RAG-Inhalte, bleiben unverändert in Nutzung.
