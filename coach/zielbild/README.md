# Coach — Zielbild (noch nicht verdrahtet)

Dieser Ordner enthält die **Ziel-Architektur** des Coach-Systems: 6 Phasen
(0, 1a, 1b, 2, 3, 4, 5), eigenes State-Objekt (`state_schema.json`),
maschinenlesbare Phasen-Gates (`phases.json`), State-Extraktion und
History-Kompression (`util_*.md`), Workflow-Templates als reine Daten
(`templates/`, `workflows_index.json`) und den n8n-Orchestrator-Flow
(`assemble_prompt_orchestrator.md`).

**Live ist davon die abgespeckte Stufe in `coach/prompts/` +
`lib/coach/assemble.ts`:** dieselben Grundideen (Modus-Regel
Führen/Ausführen, Einwand-Trio, Default-Vorschläge, hartes Ja-Gate vor dem
Bauen, Es-läuft-Moment, Betrieb-Weiche), aber auf die 4 bestehenden
App-Phasen (diagnose/analyse/plan/umsetzung) gemappt und über die
vorhandene Infrastruktur (Canvas-Tags, Tools, Client-Gates) verdrahtet.

Migrationspfad zum Zielbild (wenn dran):
1. State-Objekt einführen (Supabase) + State-Extraktion nach jedem Turn
2. History-Kompression an Phasengrenzen
3. Phasen 0/1a/1b als Verfeinerung der Diagnose (Intent → Führen → Auswahl)
4. Orchestrator-Gates server-seitig statt Client-Gate
