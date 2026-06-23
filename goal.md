# Axantilo — Project Goal & Structure

## Was ist Axantilo?
Ein KI-Coach der Unternehmen durch mäeutische Fragen zu einem fertigen AI-Implementation-Canvas führt. Input: ein Unternehmen das KI einsetzen will. Output: ein konkreter, priorisierter Implementierungsplan.

---

## Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **Database:** Supabase (sessions, canvas data, onboarding answers)
- **AI:** Google Gemini (`gemini-3.5-flash` primär, `gemini-3.1-flash-lite` Fallback) via `@google/generative-ai`, Env `GOOGLE_API_KEY`
- **Language:** TypeScript
- **Deployment:** Vercel

---

## Seiten & Pfade

### `/` — Landing Page
- Kurze Erklärung was Axantilo ist
- CTA: "Kostenlos starten" → führt zu `/onboarding`
- Warteliste-Formular (Email + optionaler Survey)
- Noch nicht gebaut in Phase 1, Placeholder reicht

### `/onboarding` — Interview Flow
Schrittweises Klick-Interview bevor der Chat startet.
Screens in Reihenfolge:

1. **Ziel-Screen** — "Was bringt dich hierher?"
   - Ich will KI einsetzen aber weiß nicht wo anfangen
   - Ich habe konkrete Ideen aber weiß nicht wie ich umsetze
   - Ich will wissen ob KI für uns sinnvoll ist
   - Ich will meiner IT/Agentur ein klares Briefing geben

2. **Erfahrungs-Screen** — "Habt ihr schon KI im Einsatz?"
   - Nein, komplettes Neuland
   - Wir nutzen ChatGPT & Co. aber unsystematisch
   - Wir haben einzelne Tools laufen
   - Wir haben schon Automationen im Einsatz

3. **Rollen-Screen** — "Wer setzt das bei euch um?"
   - Ich selbst
   - Jemand intern (IT / Kollege)
   - Externer Dienstleister
   - Noch unklar

4. **Erklärungs-Screen** — "So arbeitet Axantilo"
   - Zeigt kurz wie das Gespräch funktioniert
   - "Got it" Button → weiter

5. **Statement-Screen** — "Erkennst du dich hier wieder?"
   - Statement: "Wir wissen dass KI uns helfen könnte — aber ohne klaren Plan verlieren wir uns in Tools und Experimenten."
   - Ja / Manchmal / Nein

6. **Hindernis-Screen** — "Was hat euch bisher aufgehalten?"
   - Wir wissen nicht wo wir anfangen sollen
   - Wir haben Angst vor zu hohem Aufwand
   - Wir sind nicht sicher ob es sich lohnt
   - Uns fehlt jemand der es umsetzt

7. **Branche-Screen** — "In welcher Branche seid ihr tätig?"
   - Handel / E-Commerce
   - Dienstleistung / Beratung
   - Handwerk / Produktion
   - Gastronomie / Tourismus
   - Gesundheit / Pflege
   - Andere

8. **Tempo-Screen** — "Wie schnell wollt ihr Ergebnisse?"
   - Diese Woche erste Quick Wins
   - Innerhalb eines Monats
   - Wir planen langfristig

9. **Lade-Screen** — "Axantilo bereitet deinen Coach vor..."
   - Animierter Ladebalken, 3-4 Sekunden
   - Zeigt: "Analysiere deine Situation → Konfiguriere deinen Coach → Bereit"
   - Dann automatischer Redirect zu `/chat`

**Datenspeicherung Onboarding:**
Alle Antworten in Supabase Tabelle `sessions`:
```
id, ziel, ki_erfahrung, wer_setzt_um, hindernis, branche, tempo, created_at
```
Session-ID in localStorage speichern, wird in `/chat` als Kontext geladen.

---

### `/chat` — Haupt-Interface (Phase 1 Priority)
**Das ist die wichtigste Seite. Hier passiert alles.**

Layout: Two-Column
- **Links (60%):** Chat-Interface
- **Rechts (40%):** Canvas

#### Chat (links)
- Nachrichtenverlauf (User + Coach Bubbles)
- Eingabefeld unten mit Send-Button
- Erste Nachricht kommt automatisch vom Coach basierend auf Onboarding-Daten
- Streaming-Antworten (Claude API mit stream: true)
- Session-ID aus localStorage → Onboarding-Kontext laden → als System-Prompt einbauen

#### Canvas (rechts)
- Startet leer mit Placeholder: "Hier entsteht dein Implementierungsplan"
- Wird während des Gesprächs live befüllt
- Coach gibt strukturierte Canvas-Updates als JSON zurück (parallel zur Chat-Antwort)
- Canvas zeigt: erkannte Pain Points, mögliche Use Cases, Prioritäten

**Canvas-Datenstruktur:**
```typescript
type CanvasData = {
  pain_points: {
    title: string
    description: string
    frequency?: string
    effort?: string
    priority: 'hoch' | 'mittel' | 'niedrig'
  }[]
  use_cases: {
    title: string
    linked_pain_point: string
    effort: string
    impact: string
  }[]
  phase: 'diagnose' | 'analyse' | 'plan'
}
```

Canvas-Daten in Supabase Tabelle `canvas`:
```
id, session_id (FK), data (jsonb), updated_at
```

#### Phasen-Anzeige
Oben im Chat: Progress-Indicator
`● Diagnose  ○ Analyse  ○ Plan`

---

### `/canvas/:id` — Geteilter Canvas (später)
- Öffentlich teilbarer Link für IT/Dienstleister
- Zeigt fertigen Canvas read-only
- Noch nicht in Phase 1 gebaut

### `/dashboard` — Übersicht (später)
- Liste aller Sessions
- Noch nicht in Phase 1 gebaut

---

## Datenbankschema Supabase

```sql
-- Sessions (Onboarding-Daten)
create table sessions (
  id uuid primary key default gen_random_uuid(),
  ziel text,
  ki_erfahrung text,
  wer_setzt_um text,
  hindernis text,
  branche text,
  tempo text,
  created_at timestamp default now()
);

-- Chat-Nachrichten
create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id),
  role text check (role in ('user', 'assistant')),
  content text,
  created_at timestamp default now()
);

-- Canvas
create table canvas (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) unique,
  data jsonb default '{}',
  updated_at timestamp default now()
);
```

---

## Env Variables
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
```

---

## Build-Reihenfolge

### Phase 1 — Jetzt (Basis zum Testen)
1. Next.js Projekt setup, alle Packages, alle Dateien/Ordner anlegen
2. Supabase Schema deployen
3. `/onboarding` — Klick-Flow mit lokalem State, am Ende in Supabase speichern
4. `/chat` — Chat + Canvas nebeneinander, Claude API streaming, Canvas live update
5. Alles lokal lauffähig

### Phase 2 — Danach
6. `/` Landing Page
7. Canvas-Sharing via `/canvas/:id`
8. `/dashboard`
9. Vercel Deploy

---

## Ordnerstruktur

```
C:\Coding\aitrainer\
├── app/
│   ├── page.tsx                  (Landing — Placeholder)
│   ├── layout.tsx
│   ├── globals.css
│   ├── onboarding/
│   │   └── page.tsx              (Interview Flow)
│   ├── chat/
│   │   └── page.tsx              (Chat + Canvas)
│   ├── canvas/
│   │   └── [id]/
│   │       └── page.tsx          (Shared Canvas — Placeholder)
│   └── api/
│       ├── chat/
│       │   └── route.ts          (Claude API Streaming)
│       └── canvas/
│           └── route.ts          (Canvas Update)
├── components/
│   ├── chat/
│   │   ├── ChatWindow.tsx
│   │   ├── MessageBubble.tsx
│   │   └── ChatInput.tsx
│   ├── canvas/
│   │   ├── CanvasPanel.tsx
│   │   ├── PainPointCard.tsx
│   │   └── UseCaseCard.tsx
│   └── onboarding/
│       ├── OnboardingFlow.tsx
│       └── OnboardingStep.tsx
├── lib/
│   ├── supabase.ts
│   ├── claude.ts
│   └── types.ts
├── .env.local
├── goal.md                       (diese Datei)
└── package.json
```
