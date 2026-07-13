import type { BerndConfig, RouterDirective } from '@/lib/bernd/types';

/**
 * Directive-Dispatch für den Telegram-Adapter (WP6). Der Router
 * (`app/api/bernd/router/route.ts`) liefert `directives[]` zurück; bisher verwarf
 * `app/api/bernd/telegram/route.ts` alles außer dem reinen Antwort-Text — selbst ein
 * erfolgreiches `trigger_flow` (z.B. nach einer Telegram-HITL-Freigabe) verpuffte damit.
 * Diese Datei führt genau diese Directives tatsächlich aus, isoliert von der Route testbar.
 *
 * Webhook-Pfad-Konvention (siehe `findWebhookPath` in `lib/bernd/router-tools.ts`): Skalare,
 * die auf `_WEBHOOK_PATH` enden. Für den Versand-Einstieg wird — falls mehrere Kandidaten
 * existieren — bevorzugt ein Key gewählt, der "SEND" enthält (z.B. `EMAIL_SEND_WEBHOOK_PATH`),
 * sonst der erste `_WEBHOOK_PATH`-Slot.
 */

export interface DispatchDirectivesArgs {
  directives: RouterDirective[];
  config: BerndConfig | null;
  chatId: string;
  projectId: string;
}

/** n8n-Basis-URL ohne /api/v1 für Webhook-URLs (analog lib/bernd/router-tools.ts). */
function n8nWebhookBase(): string {
  return (process.env.N8N_API_URL || '').replace(/\/api\/v1\/?$/, '');
}

/** Alle Skalar-Einträge, die der `_WEBHOOK_PATH`-Konvention folgen (nicht-leerer String-Wert). */
function webhookPathEntries(scalars: Record<string, string> | undefined): Array<[string, string]> {
  if (!scalars) return [];
  return Object.entries(scalars).filter(
    (entry): entry is [string, string] =>
      entry[0].endsWith('WEBHOOK_PATH') && typeof entry[1] === 'string' && entry[1].trim().length > 0,
  );
}

/** Bevorzugt einen Skalar-Key, der "SEND" enthält (Freigabe-Versand-Einstieg), sonst den ersten Treffer. */
function findSendWebhookPath(scalars: Record<string, string> | undefined): string | null {
  const entries = webhookPathEntries(scalars);
  if (!entries.length) return null;
  const sendEntry = entries.find(([key]) => key.toUpperCase().includes('SEND'));
  return (sendEntry ?? entries[0])[1].trim();
}

/**
 * Führt die Directives aus, die der Telegram-Adapter selbst behandeln muss.
 * `kind:'reply'`/`'config'` sind bereits anderweitig behandelt (Text-Echo bzw. Router-Tool) →
 * übersprungen. Wirft nie — Fehler landen als menschenlesbare Hinweise im Rückgabe-Array,
 * damit die Telegram-Webhook-Route immer 200 an Telegram liefern kann.
 */
export async function dispatchDirectives(args: DispatchDirectivesArgs): Promise<string[]> {
  const { directives, config, chatId, projectId } = args;
  const hints: string[] = [];

  for (const directive of directives) {
    if (directive.kind !== 'trigger_flow') continue; // reply/config: nichts zu tun

    const slug = directive.flow_slug?.trim();
    if (!slug) {
      hints.push('Konnte einen Flow nicht auslösen — die Direktive enthielt keinen Flow-Slug.');
      continue;
    }

    const active = config?.active_templates?.find((t) => t.slug === slug);
    if (!active) {
      hints.push(`Flow "${slug}" ist bei diesem Betrieb nicht eingerichtet.`);
      continue;
    }

    const webhookPath = findSendWebhookPath(active.scalars);
    if (!webhookPath) {
      hints.push(`Flow "${slug}" hat noch keinen Versand-Webhook hinterlegt — bitte im Dashboard prüfen.`);
      continue;
    }

    const url = `${n8nWebhookBase()}/webhook/${webhookPath}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, chat_id: chatId, ...(directive.args ?? {}) }),
      });
      if (!res.ok) {
        hints.push(`Versand-Flow "${slug}" antwortete mit Fehler (${res.status}).`);
      }
    } catch (e: unknown) {
      hints.push(
        `Versand-Flow "${slug}" konnte nicht erreicht werden: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return hints;
}
