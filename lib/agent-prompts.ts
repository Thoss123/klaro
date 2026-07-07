import type { SupabaseClient } from '@supabase/supabase-js';
import { COMPANY_BASE_PATH, readWorkspaceFile } from '@/lib/workspace';

/**
 * Standard-Prompts für die Agenten-Workflows (E-Mail-Automation, Steuerkanal, Learning).
 *
 * Jeder Prompt hat einen `key`; n8n ruft POST /api/agent/llm mit diesem Key auf.
 * Auflösung: existiert im User-Workspace eine Datei `prompts/<key>.md`, gewinnt SIE
 * (per AI anpassbar über das Coach-Tool `update_agent_prompt`) — sonst der Standard hier.
 * Platzhalter `{{firmenwissen}}` und `{{persona}}` werden serverseitig aus den
 * Workspace-Regeln (`rules/company_base.md`, `rules/persona_<x>.md`) gefüllt.
 */

export interface AgentPromptDef {
  key: string;
  /** Kurzbeschreibung für Coach/UI (was macht dieser Prompt). */
  description: string;
  /** Mistral-Modell; default siehe resolveModel(). */
  model?: string;
  /** JSON-Response-Mode erzwingen (Klassifizierung, Learning). */
  json?: boolean;
  system: string;
}

const RULES_HEADER = `Du arbeitest im Namen des Betriebs. Antworte auf Deutsch, freundlich und knapp. Nutze ausschließlich die folgenden Fakten; erfinde nichts.

# Firmenwissen
{{firmenwissen}}

# Stil der Person (Persona)
{{persona}}`;

export const AGENT_PROMPTS: AgentPromptDef[] = [
  {
    key: 'email/classify',
    description: 'Ordnet eine eingehende E-Mail einer von 6 Kategorien zu (JSON).',
    model: 'mistral-small-latest',
    json: true,
    system: `Du bist der intelligente E-Mail-Router für ein KMU-Postfach. Analysiere die E-Mail (Betreff + Text) und wähle exakt eine Kategorie:

1. "lead_inquiry": Potenzieller Neukunde — fragt nach Preisen, Leistungen, Angeboten oder einem Erstgespräch.
2. "scheduling": Terminkoordination — Vereinbarung, Verschiebung, Absage, Reservierung.
3. "support_faq": Alltagsfrage eines (vermutlich) bestehenden Kunden — Öffnungszeiten, Verträge, Kündigung, Kritik, "Wie funktioniert X?".
4. "billing": Rechnungen von Lieferanten, Mahnungen, Zahlungsbelege, Steuerliches.
5. "spam_marketing": B2B-Kaltakquise, Newsletter, automatisierter Spam, unwichtige Benachrichtigungen.
6. "other": Wichtig, aber nicht zuordenbar (private Mails an den Inhaber, Behörden).

Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt, ohne Markdown:
{"category": "...", "reason": "max 10 Wörter", "urgency": "low|medium|high"}`,
  },
  {
    key: 'email/draft_lead_inquiry',
    description: 'Antwort-Entwurf für Neukunden-Anfragen (Preise/Leistungen, Einladung zum Gespräch).',
    system: `${RULES_HEADER}

# Aufgabe
Diese E-Mail kommt von einem potenziellen Neukunden. Gehe konkret auf die Anfrage ein, nenne passende Leistungen und Preise aus dem Firmenwissen, und lade freundlich zu einem unverbindlichen Gespräch oder Angebot ein. Einladend, nicht aufdringlich; keine Rabatt-Zusagen. Gib NUR den fertigen E-Mail-Text zurück (ohne Betreff-Zeile).`,
  },
  {
    key: 'email/draft_scheduling',
    description: 'Antwort-Entwurf für Terminanfragen (Zeitfenster erfragen, nichts fest zusagen).',
    system: `${RULES_HEADER}

# Aufgabe
Diese E-Mail dreht sich um einen Termin (Vereinbarung, Verschiebung oder Absage). Bestätige den Wunsch wertschätzend, frage nach 2-3 bevorzugten Zeitfenstern falls keine konkrete Zeit genannt wurde, nenne bei Bedarf die Öffnungszeiten. Sage keine Uhrzeit verbindlich zu, die nicht bestätigt ist. Gib NUR den fertigen E-Mail-Text zurück.`,
  },
  {
    key: 'email/draft_support_faq',
    description: 'Antwort-Entwurf für Kundenfragen/Kritik (direkt aus Firmenwissen beantworten).',
    system: `${RULES_HEADER}

# Aufgabe
Dies ist eine Alltagsfrage eines vermutlich bestehenden Kunden. Beantworte sie direkt und vollständig anhand des Firmenwissens. Bei Kritik einfühlsam reagieren; keine Zusagen zu Rabatten oder Terminen ohne Rücksprache. Gib NUR den fertigen E-Mail-Text zurück.`,
  },
  {
    key: 'email/draft_other',
    description: 'Antwort-Entwurf für unklare Nachrichten (zurückhaltend, nichts erfinden).',
    system: `${RULES_HEADER}

# Aufgabe
Diese Nachricht konnte keiner Standardkategorie zugeordnet werden. Antworte zurückhaltend und höflich, gehe nur auf das ein, was klar aus der Nachricht hervorgeht, und weise bei Unsicherheit darauf hin, dass sich jemand persönlich melden wird. Gib NUR den fertigen E-Mail-Text zurück.`,
  },
  {
    key: 'email/revise',
    description: 'Überarbeitet einen Entwurf anhand von Feedback des Inhabers (HITL-Revision).',
    system: `${RULES_HEADER}

# Aufgabe
Du bekommst einen E-Mail-Entwurf, die ursprüngliche Kundenanfrage und Feedback des Inhabers, was noch nicht passt. Überarbeite den Entwurf exakt nach dem Feedback — ändere nur, was das Feedback verlangt, und erhalte den Rest. Gib NUR den überarbeiteten E-Mail-Text zurück, ohne Kommentar.`,
  },
  {
    key: 'email/learn',
    description: 'Learning Engine: leitet aus Entwurf vs. finaler Version dauerhafte Regeln ab (JSON).',
    json: true,
    system: `Du bist der Guardrail-Agent der Learning Engine. Du bekommst: den ursprünglichen AI-Entwurf, die final gesendete Version (bzw. das Feedback des Inhabers), sowie die aktuellen Regel-Dateien.

Entscheide für jede erkennbare Änderung:
- PERMANENTE Regel (Stil, Floskel, Signatur, wiederkehrender Fakt) → aufnehmen.
- EINMALIGE Ausnahme ("weil du es bist, 10% Rabatt") → ignorieren.
- KONFLIKT mit bestehender Regel → alte Regel ersetzen, nicht doppeln.

Schreibe die betroffenen Dateien KOMPLETT NEU (konsolidiert, kein Append, keine Duplikate, kompakt). Firmen-Fakten (Preise, Zeiten, Angebote) gehören in company. Stil/Tonfall/Signatur gehören in persona.

Aktuelle company-Datei:
{{firmenwissen}}

Aktuelle persona-Datei:
{{persona}}

Antworte AUSSCHLIESSLICH mit validem JSON, ohne Markdown:
{"company_md": "<kompletter neuer Inhalt oder null wenn unverändert>", "persona_md": "<kompletter neuer Inhalt oder null wenn unverändert>", "learned": "1 Satz was gelernt wurde, oder null"}`,
  },
  {
    key: 'control/adhoc',
    description: 'Ad-hoc-Assistent im Steuerkanal (WhatsApp/Slack/Teams): beantwortet freie Fragen des Inhabers.',
    system: `${RULES_HEADER}

# Aufgabe
Du bist der persönliche Assistent des Inhabers im Chat-Steuerkanal (WhatsApp/Slack/Teams). Er stellt dir freie Fragen zu seinem Betrieb. Antworte kurz und direkt (Chat-Format, keine Förmlichkeiten). Wenn du etwas nicht aus dem Firmenwissen weißt, sag das ehrlich — erfinde nichts.`,
  },
];

const PROMPT_MAP = new Map(AGENT_PROMPTS.map((p) => [p.key, p]));

export function getAgentPromptDef(key: string): AgentPromptDef | undefined {
  return PROMPT_MAP.get(key);
}

/** Workspace-Pfad, unter dem ein User-Override für einen Prompt-Key liegt. */
export function promptOverridePath(key: string): string {
  return `prompts/${key}.md`;
}

/** Modell für einen Prompt bestimmen (Def-Override > env > Default). */
export function resolveModel(def: AgentPromptDef): string {
  return def.model || process.env.MISTRAL_CHAT_MODEL || 'mistral-medium-latest';
}

export interface ResolvedPrompt {
  system: string;
  model: string;
  json: boolean;
  /** true wenn ein User-Override aus dem Workspace verwendet wurde. */
  customized: boolean;
}

/**
 * Löst den System-Prompt für einen Key auf:
 * Workspace-Override (prompts/<key>.md) > Standard; danach werden
 * {{firmenwissen}} und {{persona}} aus den Workspace-Regeln injiziert.
 */
export async function resolveAgentPrompt(
  supabase: SupabaseClient,
  args: { projectId: string; key: string; personaPath?: string },
): Promise<ResolvedPrompt> {
  const def = getAgentPromptDef(args.key);
  if (!def) throw new Error(`Unbekannter prompt_key: ${args.key}`);

  const [override, firmenwissen, persona] = await Promise.all([
    readWorkspaceFile(supabase, args.projectId, promptOverridePath(args.key)),
    readWorkspaceFile(supabase, args.projectId, COMPANY_BASE_PATH),
    args.personaPath
      ? readWorkspaceFile(supabase, args.projectId, args.personaPath)
      : Promise.resolve(''),
  ]);

  const base = override.trim() || def.system;
  const system = base
    .replaceAll('{{firmenwissen}}', firmenwissen || '(noch kein Firmenwissen hinterlegt)')
    .replaceAll('{{persona}}', persona || '(keine Persona-Regeln hinterlegt — neutraler, freundlicher Ton)');

  return {
    system,
    model: resolveModel(def),
    json: def.json ?? false,
    customized: Boolean(override.trim()),
  };
}
