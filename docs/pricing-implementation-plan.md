# Axantilo — Credits: Technischer Implementierungsplan

> Begleitdokument zu [`pricing-draft.md`](./pricing-draft.md)

**Scope jetzt:** Testphase only — 2.000 Start-Credits, tokenbasierte Abbuchung, €49-Einmal-Top-up (+6.000 Credits). Projekte unbegrenzt. **Keine Abo-Tiers.**

**Scope später:** Launch-Tiers (Starter/Pro/Business) — siehe Abschnitt „Phase 2 (Backlog)“.

---

## Architektur (Testphase)

```text
API-Call (chat, strategy, canvas-worker, transcribe, …)
        ↓
  Provider liefert usage (input/output tokens)
        ↓
  lib/billing/token-cost.ts  →  €-Kosten je Modell
        ↓
  lib/billing/credits.ts     →  credits = round(eur × 400)
        ↓
  debitCredits() + credit_ledger
        ↓
  UI: AccountCreditsPanel (Sidebar / Account-Bereich)

Stripe One-Time (€49)
        ↓
  POST /api/billing/webhook  →  +6000 credits
```

**Grundprinzip:** Server-seitig enforced. Abbuchung **nach** erfolgreichem API-Call, basierend auf **tatsächlichem** Token-Usage — nicht pauschal pro Aktion.

---

## Credit-Math (SSOT)

```typescript
// lib/billing/credit-constants.ts
export const CREDITS_PER_EURO = 400;      // 2000 credits = €5
export const EURO_PER_CREDIT = 0.0025;

export const TEST_STARTING_CREDITS = 2000;
export const TEST_TOPUP_PRICE_EUR = 49;
export const TEST_TOPUP_CREDITS = 6000;   // €15 API budget
```

```typescript
// lib/billing/token-cost.ts
export function usageToCredits(usage: TokenUsage, model: string): number {
  const eur = computeProviderCostEur(usage, model); // Anthropic + Mistral Preistabellen
  return Math.max(1, Math.ceil(eur * CREDITS_PER_EURO));
}
```

Modell-Preise in **`lib/billing/model-prices.ts`** (Anthropic Haiku/Sonnet, Mistral Small/Large) — bei Provider-Preisänderung anpassen.

---

## Phase 1 — Datenmodell

### Migration: `20260706120000_billing_credits.sql`

```sql
create table public.user_billing (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Testphase: ein Guthaben, kein Tier
  credits_balance integer not null default 2000,
  credits_lifetime_granted integer not null default 2000,
  stripe_customer_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  action text not null,           -- chat, strategy, canvas_worker, transcribe, topup
  credits integer not null,       -- negative = debit, positive = grant
  balance_after integer,
  -- Token-Transparenz
  api_cost_eur numeric(10, 6),
  input_tokens integer,
  output_tokens integer,
  model text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index credit_ledger_user_created on public.credit_ledger(user_id, created_at desc);
```

**Kein** `billing_plan` enum, **kein** daily limit, **kein** Projekt-Gate in Testphase.

RLS: User read-only auf eigene Zeilen; Writes via service-role.

---

## Phase 2 — Credit-Engine

### `lib/billing/credits.ts`

| Funktion | Zweck |
|----------|-------|
| `ensureUserBilling(userId)` | Lazy-init mit `credits_balance = 2000` |
| `getCreditsBalance(userId)` | Aktuelle Balance |
| `canAfford(userId, estimatedCredits)` | Pre-check (Schätzung aus erwarteten Tokens) |
| `debitFromUsage(userId, usage, model, action, meta)` | € → Credits → atomar debit + ledger |
| `grantCredits(userId, amount, reason, meta)` | Top-up / Admin-Grant |

**Atomarität:** Postgres `debit_user_credits(user_id, amount, …)` mit `FOR UPDATE`.

**Pre-check in `/api/chat`:** Grobe Obergrenze schätzen (System-Prompt + History + max output) — bei `balance < estimate` → 402.

**Debit:** Nach Stream-Ende alle Tool-Rounds summieren:

```typescript
let totalUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, ... };
// pro Provider-Round addieren
await debitFromUsage(userId, totalUsage, model, 'chat', { phase, sessionId });
```

### Provider-Usage durchreichen

| Route | Usage-Quelle |
|-------|--------------|
| `POST /api/chat` | `AnthropicProvider` / `MistralProvider` — `finalMessage.usage` pro Tool-Round summieren |
| `POST /api/strategy` | Anthropic `messages.create` response.usage |
| `POST /api/canvas-worker` | Mistral rounds in agent-orchestration |
| `POST /api/transcribe` | Voxtral/audio — Dauer oder Token-Äquivalent |

**`lib/ai-provider.ts`:** Return-Type erweitern — `{ stream, getTotalUsage(): TokenUsage }` oder Usage in Callback nach Stream.

---

## Phase 3 — Stripe (Testphase: nur Top-up)

### Ein Product

- **Name:** Axantilo Test-Credits
- **Preis:** €49 one-time
- **Gutschrift:** +6.000 Credits

### Routes

| Route | Zweck |
|-------|-------|
| `POST /api/billing/checkout` | `{ type: 'topup' }` → Stripe Checkout Session |
| `POST /api/billing/webhook` | `checkout.session.completed` → `grantCredits(6000)` |

Kein Subscription-Webhook, kein Customer Portal (Testphase).

Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_TEST_TOPUP`.

---

## Phase 4 — UI

| Komponente | Funktion |
|------------|----------|
| `AccountCreditsPanel` | Credits im Account-Bereich der Sidebar |
| `Top-up CTA` | Dezenter Button: „Aufladen“ → Stripe Checkout |
| `GET /api/billing/status` | `{ balance, lifetimeGranted, lastDebits[] }` |

Makler-LP: Testphase-Text anpassen (2.000 Start, €49 Top-up, 6.000 Credits).

**Kein** `/preise` mit Tiers — erst nach Launch.

---

## Phase 5 — Dev & Ops

- `BILLING_DISABLED=true` — kein Debit, unlimited (lokal)
- Admin: manuelles `grantCredits` für Warteliste
- Ledger-Export: `api_cost_eur` vs. Anthropic/Mistral Dashboard abgleichen
- Test: `usageToCredits({ input: 1_000_000, output: 0 }, 'claude-haiku-4-5')` → erwartete Credits

---

## Testplan

| Test | Inhalt |
|------|--------|
| `usageToCredits` | €5 → 2000 Credits; €0.03 → 12 Credits |
| Debit atomar | Parallele Requests |
| 402 bei balance 0 | Chat blockiert |
| Top-up webhook | +6000 Balance |
| Kein Projekt-Limit | 5 Projekte anlegen → ok |

---

## Rollout (Testphase)

```text
1. Migration + credit-constants + model-prices + token-cost
2. Provider Usage-Tracking (ai-provider.ts)
3. credits.ts + debit in chat/strategy/canvas-worker/transcribe
4. AccountCreditsPanel + Top-up CTA
5. Stripe €49 one-time + webhook
6. BILLING_DISABLED=false für Alpha-Tester
```

---

## Phase 2 (Backlog) — Launch-Tiers

Nach Testphase-Erkenntnissen:

- `billing_plan` enum + monatliche Grants
- Projekt-/Workflow-Gates
- Abo-Stripe (€19/€59/€199)
- `/preise`-Seite
- Siehe Launch-Abschnitt in `pricing-draft.md`

---

## Dateien

### Neu (Testphase)

```
lib/billing/credit-constants.ts
lib/billing/model-prices.ts
lib/billing/token-cost.ts
lib/billing/credits.ts
app/api/billing/checkout/route.ts
app/api/billing/webhook/route.ts
app/api/billing/status/route.ts
components/chat/AccountCreditsPanel.tsx
supabase/migrations/20260706120000_billing_credits.sql
tests/billing/token-cost.test.ts
tests/billing/credits.test.ts
```

### Geändert

```
lib/ai-provider.ts             — usage aggregation
app/api/chat/route.ts          — debitFromUsage nach Stream
app/api/strategy/route.ts
app/api/canvas-worker/route.ts
app/api/transcribe/route.ts
components/chat/SidebarAccountOverview.tsx
app/immobilienmakler/MaklerLanding.tsx
```
