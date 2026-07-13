/**
 * TS-Typen für Bernd (digitaler Handwerker-Mitarbeiter): Instanz-Konfiguration,
 * Kanal-Pairing, Router-Konversations-State sowie die Router-Direktiven, mit denen der
 * Telegram-Router (und perspektivisch der Dashboard-Änderungs-Chat) auf eine eingehende
 * Nachricht reagiert. Siehe Architekturplan §2 (Router-Agent) + §4 (Datenmodell).
 */

/** "Bei welchen Mails soll sich Bernd melden, bei welchen nicht" + Mute-Listen. */
export interface NotifyRules {
  /** E-Mail-Kategorien (aus `email/classify`), zu denen aktiv benachrichtigt wird. */
  email_categories_notify?: string[];
  /** E-Mail-Kategorien, die stummgeschaltet sind (kein Push, keine Freigabe-Anfrage). */
  mute?: string[];
  [key: string]: unknown;
}

/** Ein im Betrieb aktivierter Golden-Flow-Template samt gebundener n8n-Instanz + Skalaren. */
export interface ActiveTemplate {
  /** Slug aus `lib/bernd/templates.ts` (z.B. "angebot-autopilot"). */
  slug: string;
  /** n8n-Workflow-ID, sobald deployt (fehlt bei nur ausgewählten, noch nicht deployten Templates). */
  n8n_workflow_id?: string;
  /** Skalar-Slot-Werte, mit denen dieser Flow parametrisiert wurde (z.B. STUNDENSATZ). */
  scalars?: Record<string, string>;
}

/** Status einer im Setup-Chat vorgeschlagenen/gewählten Scope (Zeitfresser). */
export type ScopeStatus = 'vorgeschlagen' | 'gewaehlt' | 'abgelehnt';

/** Eine Scope-Auswahl im lebenden Setup-Profil (Setup-Chat → Profil-Canvas). */
export interface SetupScope {
  /** Scope-ID, siehe `SCOPE_TO_SLUG` in `lib/bernd/scopes.ts` (z.B. "email_triage"). */
  id: string;
  status: ScopeStatus;
}

/**
 * Lebendes Setup-Profil während des v2-Onboardings (Tabelle `bernd_configs`, Spalte
 * `setup_state`). Wird vom Setup-Chat-Tag-Parser (WP2) inkrementell befüllt und vom
 * Profil-Canvas (WP3) live gerendert; beim "Bernd einstellen"-Deployment (WP5) auf die
 * operativen `BerndConfig`-Felder abgebildet und danach eingefroren. Credentials (Gmail,
 * Telegram) werden bewusst NICHT hier gehalten — die kommen live aus `user_credentials`
 * bzw. `bernd_channel_links`, damit der Verbindungsstatus nie veraltet im JSONB einfriert.
 */
export interface BerndSetupState {
  /** Firmen-/Betriebsbild, wie es der Setup-Chat aus `<profil>`-Tags gesammelt hat. */
  profil?: { gewerk?: string; firmenname?: string; mitarbeiter?: string; standort?: string; ton?: string };
  /** Zeitfresser-Scopes, die vorgeschlagen bzw. vom Nutzer gewählt/abgelehnt wurden. */
  scopes?: SetupScope[];
  /** Ablauf-Pflichtfragen je Scope: scope-id → Frage → Antwort. */
  ablauf?: Record<string, Record<string, string>>;
  /** Freitext-Ziele, die der Nutzer im Setup-Chat genannt hat. */
  ziele?: string[];
  /** Freigabe-/Verhaltensregeln (z.B. "alles erst zur Freigabe"). */
  regeln?: string[];
  /** Kurze Coach-Einschätzungen je Thema (z.B. "betrieb" → Zusammenfassung). */
  einschaetzung?: Record<string, string>;
  /** Fortschritts-Prozente je Onboarding-Block, für die Profil-Canvas-Fortschrittsanzeige. */
  fortschritt?: { betrieb?: number; aufgaben?: number; wissen?: number; regeln?: number };
  /** Hochgeladene Wissens-Referenzen: Typ (z.B. "stilproben") → Workspace-Dateipfade. */
  wissen?: Record<string, string[]>;
  /** Optionale Zukunfts-Ideen (weitere Scopes/Automationen), noch nicht Teil des Deployments. */
  zukunft?: string[];
  /** Ob der Nutzer die finale Klartext-Zusammenfassung vor "Bernd einstellen" bestätigt hat. */
  zusammenfassung_bestaetigt?: boolean;
}

/** Bernd-Instanz-Konfiguration eines Betriebs, 1:1 zu `projects` (Tabelle `bernd_configs`). */
export interface BerndConfig {
  project_id: string;
  user_id: string;
  gewerk: string | null;
  /** draft = noch im Onboarding, active = läuft, paused = manuell pausiert. */
  status: 'draft' | 'active' | 'paused';
  /** Preisparameter: Stundensatz, Materialaufschlag, Anfahrtspauschale, ... */
  preislogik: Record<string, unknown>;
  /** Angebundene Tools/CRM/Mail (Anzeige + Onboarding-Stand). */
  tools: Record<string, unknown>;
  notify_rules: NotifyRules;
  active_templates: ActiveTemplate[];
  /** Generierte Kann-Liste/Kanäle fürs Dashboard (Steckbrief-Bereich). */
  steckbrief: Record<string, unknown>;
  /** Lebendes Setup-Profil aus dem v2-Onboarding-Chat (siehe `BerndSetupState`). */
  setup_state: BerndSetupState;
  created_at: string;
  updated_at: string;
}

/** Kanal-Pairing für den geteilten Bot: Telegram-Identität → Projekt (Tabelle `bernd_channel_links`). */
export interface BerndChannelLink {
  id: string;
  user_id: string;
  project_id: string;
  channel: string;
  chat_id: string;
  pairing_code: string | null;
  verified_at: string | null;
  created_at: string;
}

/** Ein Router-Konversations-Eintrag/Audit-Log (Tabelle `bernd_messages`). */
export interface BerndMessage {
  id: string;
  project_id: string;
  chat_id: string;
  direction: 'in' | 'out';
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  media_kind: 'text' | 'voice' | 'photo' | null;
  meta: Record<string, unknown>;
  created_at: string;
}

/**
 * Klassifizierte Absicht einer eingehenden Nachricht (Router-Klassifizierungsschritt).
 * - answer: direkte Wissensfrage, aus company_base/persona beantwortbar
 * - trigger_flow: löst einen bestehenden Golden-Flow aus (z.B. Angebots-Autopilot)
 * - propose_action: schlägt einen Entwurf vor, der erst per HITL bestätigt werden muss
 * - confirm / revise: Antwort auf eine offene `agent_pending_actions`-Zeile
 * - config: Meta-Wunsch zur Bernd-Konfiguration (Preis/Wissen/Notify-Regel/Flow an-aus)
 */
export type BerndIntent = 'answer' | 'trigger_flow' | 'propose_action' | 'confirm' | 'revise' | 'config';

/**
 * Direktive, die der Router nach der Reasoning-Runde zurückgibt — bestimmt, was der
 * n8n-Inbound-Flow als Nächstes tut (Antwort senden / Subflow triggern / Konfig-Ergebnis melden).
 */
export interface RouterDirective {
  kind: 'reply' | 'trigger_flow' | 'config';
  /** Freitext-Antwort an den Nutzer (bei kind "reply" oder als Bestätigungstext bei "config"). */
  text?: string;
  /** Slug des auszulösenden Golden-Flows (bei kind "trigger_flow"). */
  flow_slug?: string;
  /** Argumente/Skalare für den ausgelösten Flow bzw. die Konfig-Mutation. */
  args?: Record<string, unknown>;
}
