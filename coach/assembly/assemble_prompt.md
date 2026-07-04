# Coach v2 — Prompt-Assembly (LIVE-System)

Der System-Prompt des Coaches wird pro Request modular assembliert —
implementiert in `lib/coach/assemble.ts`, eingehängt in
`app/api/chat/route.ts`.

## Reihenfolge (fix)

```
1. AXANTILO_SHARED_RULES   lib/claude.ts — Tag-/Stil-Vertrag der App
                           (options/phase_complete-Format, eine Frage pro
                           Nachricht, kein Tech-Sprech, Quellentreue, …)
2. BASE                    coach/prompts/base.md — Identität, Modus-Regel
                           (Führen/Ausführen), Einwand-Trio, Guardrails,
                           Stand-Block
3. PHASENMODUL             coach/prompts/phase_{diagnose|analyse|plan|umsetzung}.md
                           → ersetzt {{phase_module}} in base.md
4. PLATZHALTER             app/api/chat/route.ts füllt wie bisher
                           {{firmen_kontext}}, {{pain_points}},
                           {{workflow_plans}}, {{node_map_rules}}, … 
5. RAG                     'wissen'-Einträge werden phasengefiltert
                           automatisch angehängt; alles andere holt der
                           Coach selbst per search_knowledge-Tool
```

Tool-Definitionen kommen NICHT in den Prompt-Text — sie gehen über den
tools-Parameter des API-Calls, phasengefiltert durch
`getToolsForPhase()` in `lib/ai-tools.ts`.

## Türsteher (Code-Gates)

`phase_complete`-Tags des Modells sind nur ein Signal. Ob der Übergang
wirklich stattfindet, entscheidet `canAdvanceFromPhase()` in
`lib/can-phase-complete.ts` (aufgerufen in `app/chat/page.tsx`):

- **diagnose → analyse:** mindestens 1 potenzielle Verbesserung mit Titel
  auf dem Canvas, sonst geblockt (`no_pain_points`).
- **plan → umsetzung:** mindestens 1 valider Workflow-Plan; ohne
  Coach-Signal zusätzlich: jeder Punkt verlinkt (`no_workflows`,
  `pain_points_without_workflow`).
- **analyse → plan:** kein hartes Code-Gate — rank/use_cases schreibt der
  Canvas-Worker asynchron; ein Check zum Tag-Zeitpunkt würde falsch
  blocken. Gate lebt als harte Regel im Phasenmodul.

Übersicht: `coach/config/phases.json`.

## Dev-Verhalten

Im Dev-Modus werden die .md-Dateien bei **jedem Request frisch** gelesen —
Prompt-Änderungen wirken ohne Neustart. In Produktion wird pro Prozess
gecacht; `next.config.mjs` nimmt `coach/prompts/**` per
`outputFileTracingIncludes` mit ins Deployment.

## Revert (vollständig, ohne Code-Änderung)

```
# .env.local
COACH_V2=false
```

→ `app/api/chat/route.ts` nutzt wieder den alten monolithischen Prompt-Pfad
(`getSystemPrompt()` aus `lib/claude.ts`), der unverändert im Repo liegt.
Zusätzlich liegt eine Sicherung des alten Prompt-Stands in
`_archive/2026-07-02/`. Der Assembler fällt außerdem automatisch auf den
alten Pfad zurück (fail-open), wenn die Prompt-Dateien fehlen oder
`{{phase_module}}` in base.md nicht existiert.

## Neue Verhaltensregeln ändern — wo?

| Was | Datei |
|---|---|
| Identität, Modus-Regel, Einwände, Guardrails | `coach/prompts/base.md` |
| Verhalten einer Phase | `coach/prompts/phase_*.md` |
| Tag-Formate, Chat-Stil (alle Phasen) | `AXANTILO_SHARED_RULES` in `lib/claude.ts` |
| Tool-Verfügbarkeit pro Phase | `getToolsForPhase()` in `lib/ai-tools.ts` |
| Code-Gates | `lib/can-phase-complete.ts` |

Regel aus dem Zielbild, die weiter gilt: **Phasenmodule nennen keine
konkreten Workflow-Namen oder -Anzahlen** — Inhalte kommen aus Canvas,
RAG (`search_knowledge`) und Recherche, nicht aus dem Prompt-Text.

## Zielbild

Die volle Ausbaustufe (6 Phasen 0–5, eigenes State-Objekt mit
JSON-Schema, State-Extraktion, History-Kompression, n8n-Orchestrator als
Türsteher, Workflow-Templates als reine Daten) ist in `coach/zielbild/`
dokumentiert und wird schrittweise übernommen.
