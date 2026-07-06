# Axantilo — Pricing Draft

> Stand: Juli 2026
> Technischer Umsetzungsplan: [`pricing-implementation-plan.md`](./pricing-implementation-plan.md)

---

## Testphase (aktuell — MVP Billing)

Einfaches Modell für Warteliste / Alpha-Tester. **Keine Abo-Tiers**, keine Projekt-Limits.

### Kontingent

| | Wert |
|---|------|
| **Start-Guthaben** | **2.000 Credits** (einmalig pro Account) |
| **Projekte** | **Unbegrenzt** |
| **Workflows / Deploy** | **Unbegrenzt** (solange Credits reichen) |
| **Strategie + Voice** | Inklusive (verbrauchen Credits wie jede API-Aktion) |

### Credit-Umrechnung (tokenbasiert)

Credits spiegeln **echte API-Kosten** wider — keine Pauschale pro Nachricht.

**Referenz:** **€5,00 API-Kosten = 2.000 Credits verbraucht**

```
Credits = API-Kosten in € × 400
API-Kosten in € = Credits ÷ 400
```

| API-Kosten | Credits |
|----------:|--------:|
| €1,00 | 400 |
| €5,00 | 2.000 |
| €15,00 | 6.000 |

**1 Credit = €0,0025** tatsächliche Provider-Kosten (Anthropic/Mistral nach Token-Usage).

Beispiel: Eine Coach-Antwort verursacht laut Provider **€0,03** → **12 Credits** abgebucht (nicht pauschal 10).

### Aufladung (einmalig)

| Paket | Preis | Credits (API-Äquivalent) | Interne API-Kosten |
|-------|------:|-------------------------:|-------------------:|
| **Test-Top-up** | **€49** | **+6.000** (= **€15** API-Budget) | ~€15 |

- **Einmalzahlung** via Stripe (kein Abo)
- Mehrfach kaufbar, solange Testphase läuft
- **Marge Top-up:** €49 − €15 ≈ **69 %** auf variable API-Kosten

### Typischer Test-User

```
Start:     2.000 Credits  (~€5 API)
+ Top-up:  6.000 Credits  (~€15 API) für €49
─────────────────────────────────────
Gesamt:    8.000 Credits  (~€20 API-Budget)
```

Reicht für Diagnose + Analyse + mehrere Workflows — abhängig vom tatsächlichen Token-Verbrauch.

### UX (Testphase)

- Chat-Header: `1.240 / 2.000 Credits` (oder Gesamtbalance nach Top-up)
- Bei 0 Credits: „Credits aufladen — €49 für 6.000 Credits (~€15 Nutzung)“
- Optional im Dev/Ledger: letzte Abbuchung mit Token-Detail (input/output tokens, Modell, €-Kosten)

---

## Launch-Tiers (später — nach Testphase)

> Vollständiges Modell für Go-Live — **noch nicht implementieren**.

| | **Free** | **Starter** | **Pro** | **Business** |
|---|:---:|:---:|:---:|:---:|
| **Preis** | €0 | **€19/Mo** | **€59/Mo** | **€199/Mo** |
| **Credits** | 200/Tag, max. 2.000 | 2.000/Mo | 5.000/Mo | 20.000/Mo |
| **Projekte** | 1 | 1 | 1 | bis 5 |

Details siehe Git-History / vorherige Draft-Version. Tokenbasierte Abbuchung bleibt auch im Launch-Modell.

---

## Spätere Tier-Erweiterungen (Backlog)

| Feature | Ziel-Tier |
|---------|-----------|
| Wissensmanagement / Firmen-Wiki | Pro+ |
| MCP-Software-Einrichtung via Agent | Pro+ |
| SSO (SAML) | Business |
| AVV Enterprise | Business |

---

## Offene Entscheidungen (Testphase)

- [ ] Start-Guthaben 2.000: bei Registrierung oder erst nach Wartelisten-Freischaltung?
- [ ] Top-up €49: Stripe sofort oder manuell für erste Tester?
- [ ] Canvas-Worker (Mistral): in Credit-Abbuchung einbeziehen — **ja** (tokenbasiert)
- [ ] Mindest-Abbuchung pro Request (z. B. min. 1 Credit)?
