# Axantilo App - MVP Todos

## 1. Setup (Erledigt)
- [x] Next.js 14 Projekt initialisiert
- [x] Abhängigkeiten installiert (Supabase, Anthropic, Tailwind, Lucide etc.)
- [x] Ordnerstruktur erstellt
- [x] Types definiert (`lib/types.ts`)
- [x] Supabase konfiguriert (`lib/supabase.ts`, SQL-Schema)
- [x] Claude API Helper (`lib/claude.ts`)
- [x] Chat API Route (`app/api/chat/route.ts`)
- [x] Platzhalterseiten

## 2. Datenbank (Ausstehend)
- [ ] SQL-Schema via Supabase CLI: `npm run db:push` (nach `npx supabase link`)
- [ ] `.env.local` mit echten Schlüsseln befüllen (Supabase URL/Anon Key, Anthropic API Key)

## 3. UI-Komponenten entwickeln
- [ ] `OnboardingFlow.tsx` / `OnboardingStep.tsx` bauen (Formular-Komponenten für Onboarding)
- [x] `ChatWindow.tsx`, `MessageBubble.tsx`, `ChatInput.tsx` (Chat Interface, Streaming-Support)
- [x] `CanvasPanel.tsx`, `PainPointCard.tsx`, `UseCaseCard.tsx` (Rechtes Panel für Diagnoseergebnisse)

## 4. Seiten zusammenbauen
- [ ] **Onboarding Page (`app/onboarding/page.tsx`)**: Nutzer sammelt die 6 initialen Kontext-Fragen -> Erstellt Session in Supabase -> Redirect zum Chat
- [x] **Chat Page (`app/chat/page.tsx`)**: Linkes Fenster: Chat-UI, Rechtes Fenster: Canvas. Zustand über React State synchronisieren
- [ ] **Shared Canvas (`app/canvas/[id]/page.tsx`)**: Read-only Ansicht des Canvas über Session-ID abrufen

## 5. API / Logik anbinden
- [ ] Chat-Interface an `POST /api/chat` Route anbinden inkl. Streaming-Parsing
- [ ] Regex oder Logik, um `<canvas_update>` Tags aus Claude-Responses abzufangen, zu parsen und im Canvas State abzulegen
- [ ] Regelmäßiges Speichern des Canvas-Status (und Chat-Verlaufs) in Supabase über Session-ID

## 6. MVP Feinschliff
- [ ] Loading States & Error Handling
- [ ] Styling und Layout-Feinschliff (TailwindCSS)
- [ ] Vercel Deployment
