import type { BerndSetupState } from '@/lib/bernd/types';

/**
 * Regelbasiertes Completion-Gate für den Setup-Chat (WP5, siehe Architekturplan
 * `nein-nur-handwerker-das-mutable-charm.md` §WP3/§WP5). Kein LLM — reine Bedingungsprüfung
 * auf `setup_state` + den live ermittelten Verbindungsstatus (Gmail/Telegram kommen bewusst
 * NICHT aus `setup_state` selbst, siehe `BerndSetupState`-Doku in lib/bernd/types.ts, damit der
 * Stand nie veraltet im JSONB einfriert).
 *
 * Zweistufig:
 * - Pflicht ("Bernd kann starten"): mindestens eine Aufgabe gewählt, E-Mail verbunden,
 *   Telegram verbunden, mindestens eine Freigabe-/Verhaltensregel bestätigt.
 * - Optional ("Bernd wird besser"): Ton festgelegt, Ablauf-Pflichtfragen je gewählter Aufgabe
 *   beantwortet, mindestens eine E-Mail-Stilprobe hochgeladen. Beeinflusst `canStart` NICHT —
 *   wird nur zur Anzeige (Profil-Canvas, WP3) mitgegeben.
 */

export interface GateInput {
  setupState: BerndSetupState;
  /** `user_credentials` hat einen aktiven Eintrag mit tool_name='gmail' für dieses Projekt. */
  emailConnected: boolean;
  /** `bernd_channel_links` hat eine verifizierte Telegram-Zeile für dieses Projekt. */
  telegramConnected: boolean;
}

export interface GateItem {
  /** Stabiler Schlüssel, z.B. für UI-Tests oder gezieltes Nachschlagen einzelner Punkte. */
  key: string;
  /** Deutsches Nutzer-Label (Checkliste im Profil-Canvas, Chat-Prompt-Injektion). */
  label: string;
  done: boolean;
  pflicht: boolean;
}

export interface GateResult {
  /** true, sobald alle Pflichtpunkte erfüllt sind — "Bernd einstellen" darf ausgelöst werden. */
  canStart: boolean;
  items: GateItem[];
  /** Labels der noch offenen Pflichtpunkte (leer, wenn canStart true ist). */
  missing: string[];
}

/** Bewertet den aktuellen Setup-Stand gegen das Minimal-Gate + die optionalen Verbesserungspunkte. */
export function evaluateGate(input: GateInput): GateResult {
  const { setupState, emailConnected, telegramConnected } = input;
  const gewaehlteScopeIds = (setupState.scopes ?? [])
    .filter((scope) => scope.status === 'gewaehlt')
    .map((scope) => scope.id);

  const items: GateItem[] = [
    {
      key: 'scope_gewaehlt',
      label: 'Aufgabe gewählt',
      done: gewaehlteScopeIds.length > 0,
      pflicht: true,
    },
    {
      key: 'email_connected',
      label: 'E-Mail-Postfach verbunden',
      done: emailConnected,
      pflicht: true,
    },
    {
      key: 'telegram_connected',
      label: 'Telegram verbunden',
      done: telegramConnected,
      pflicht: true,
    },
    {
      key: 'regel_bestaetigt',
      label: 'Freigabe-Regel bestätigt',
      done: (setupState.regeln ?? []).length > 0,
      pflicht: true,
    },
    {
      key: 'ton_gesetzt',
      label: 'Ton festgelegt',
      done: Boolean(setupState.profil?.ton?.trim()),
      pflicht: false,
    },
    {
      key: 'ablauf_beantwortet',
      label: 'Ablauf-Fragen beantwortet',
      done:
        gewaehlteScopeIds.length > 0 &&
        gewaehlteScopeIds.every((id) => Object.keys(setupState.ablauf?.[id] ?? {}).length > 0),
      pflicht: false,
    },
    {
      key: 'stilproben_hochgeladen',
      label: 'Stilproben hochgeladen',
      done: (setupState.wissen?.mail_stilproben ?? []).length > 0,
      pflicht: false,
    },
  ];

  const missing = items.filter((item) => item.pflicht && !item.done).map((item) => item.label);

  return { canStart: missing.length === 0, items, missing };
}

/** Kompakter deutscher Satz für die Setup-Prompt-Injektion ({{gate_status}}, siehe setup-prompt.ts). */
export function buildGateStatusText(result: GateResult): string {
  if (result.canStart) {
    return 'Alle Pflichtpunkte erfüllt — Zusammenfassung + Bestätigung einholen.';
  }
  return `Offen: ${result.missing.join(', ')}`;
}
