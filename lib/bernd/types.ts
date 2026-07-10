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
