import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-seitige Tools für den freien Assistenten (Steuerkanal `control/adhoc`).
 *
 * Anders als bei nativen n8n-Agent-Nodes läuft die Function-Calling-Schleife in der App
 * (siehe app/api/agent/assistant): So bleibt der Mistral-Key server-only und die Token
 * ALLER Runden werden zuverlässig gezählt und als Credits abgezogen — auch bei
 * mehrstufigen Tool-Aufrufen, wo n8n-Agent-Nodes die Usage oft verlieren.
 *
 * Tools, die eigene Axantilo-Daten lesen (pending drafts), funktionieren sofort.
 * Kalender/CRM rufen einen n8n-Tool-Webhook (native n8n-Nodes dahinter) — env-gated,
 * bis der Nutzer die Integration verbunden hat; sonst melden sie sauber „nicht verbunden".
 */

export interface ToolContext {
  supabase: SupabaseClient;
  projectId: string;
}

export interface ServerTool {
  name: string;
  description: string;
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  execute: (ctx: ToolContext, args: Record<string, unknown>) => Promise<unknown>;
}

/** Optionaler n8n-Tool-Webhook (native Calendar/CRM-Nodes dahinter). */
async function callN8nTool(
  envKey: string,
  body: Record<string, unknown>,
): Promise<{ connected: boolean; data?: unknown; hint?: string }> {
  const url = process.env[envKey]?.trim();
  if (!url) {
    return { connected: false, hint: 'Diese Integration ist noch nicht verbunden — bitte in Axantilo verbinden.' };
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { connected: true, hint: `Abruf fehlgeschlagen (${res.status}).` };
    return { connected: true, data: await res.json().catch(() => null) };
  } catch (e) {
    return { connected: true, hint: e instanceof Error ? e.message : 'Abruf fehlgeschlagen.' };
  }
}

export const ASSISTANT_TOOLS: ServerTool[] = [
  {
    name: 'list_pending_drafts',
    description:
      'Listet Antwort-Entwürfe, die auf Freigabe des Inhabers warten (oder schon gesendet/abgebrochen sind). Nutze es bei Fragen wie „was wartet auf mich?", „welche Entwürfe sind offen?", „habe ich was übersehen?".',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'sent', 'cancelled'],
          description: 'Filter; Standard "pending" (wartet auf Freigabe).',
        },
      },
    },
    async execute(ctx, args) {
      const status = typeof args.status === 'string' ? args.status : 'pending';
      const { data } = await ctx.supabase
        .from('agent_pending_actions')
        .select('contact, payload, status, updated_at')
        .eq('project_id', ctx.projectId)
        .eq('status', status)
        .order('updated_at', { ascending: false })
        .limit(20);
      const rows = (data ?? []) as Array<{ payload?: Record<string, unknown>; updated_at?: string }>;
      return {
        count: rows.length,
        drafts: rows.map((r) => ({
          empfaenger: r.payload?.send_target ?? null,
          betreff: r.payload?.subject ?? null,
          kategorie: r.payload?.category ?? null,
          stand: r.updated_at ?? null,
        })),
      };
    },
  },
  {
    name: 'get_calendar',
    description:
      'Freie/belegte Termine der nächsten Tage aus dem verbundenen Kalender. Nutze es bei „wann habe ich Zeit?", „was steht diese Woche an?", „ist Dienstag frei?".',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Zeitraum in Tagen ab heute (Standard 7).' },
      },
    },
    execute(ctx, args) {
      const days = typeof args.days === 'number' ? args.days : 7;
      return callN8nTool('ASSISTANT_CALENDAR_WEBHOOK_URL', { project_id: ctx.projectId, days });
    },
  },
  {
    name: 'crm_lookup',
    description:
      'Schlägt einen Kontakt oder offene Leads im verbundenen CRM nach. Nutze es bei „ist X schon Kunde?", „welche Leads sind offen?", „was war der letzte Kontakt mit Y?".',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name, E-Mail oder Anliegen (z.B. "offene Leads").' },
      },
      required: ['query'],
    },
    execute(ctx, args) {
      return callN8nTool('ASSISTANT_CRM_WEBHOOK_URL', {
        project_id: ctx.projectId,
        query: typeof args.query === 'string' ? args.query : '',
      });
    },
  },
];

const TOOL_MAP = new Map(ASSISTANT_TOOLS.map((t) => [t.name, t]));

export function getServerTool(name: string): ServerTool | undefined {
  return TOOL_MAP.get(name);
}

/** Tool-Definitionen im Mistral-Function-Format. */
export function assistantToolsForMistral() {
  return ASSISTANT_TOOLS.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}
