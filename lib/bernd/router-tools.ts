import { COMPANY_BASE_PATH, readWorkspaceFile } from '@/lib/workspace';
import { getBerndConfig } from '@/lib/bernd/config';
import { getExecutions } from '@/lib/n8n';
import {
  CONFIG_TOOLS,
  configToolsForMistral,
  runConfigTool,
  type BerndToolContext,
  type ConfigToolResult,
} from '@/lib/bernd/config-tools';

/**
 * Arbeits-Tools des Telegram-Routers (ServerTool-Muster wie lib/agent-tools-server.ts,
 * aber mit `BerndToolContext` — der Router braucht zusätzlich `userId` für die
 * Konfig-Mutationen). Der Router bietet sowohl diese Arbeits-Tools als auch die
 * geteilten Konfig-Tools (`lib/bernd/config-tools.ts`) in EINEM Function-Calling-Loop an
 * (Architekturplan §2).
 */

export interface RouterTool {
  name: string;
  description: string;
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  execute: (ctx: BerndToolContext, args: Record<string, unknown>) => Promise<unknown>;
}

/** n8n-Basis-URL ohne /api/v1 für Webhook-URLs (analog lib/deploy-agent-workflow.ts). */
function n8nWebhookBase(): string {
  return (process.env.N8N_API_URL || '').replace(/\/api\/v1\/?$/, '');
}

/** Sucht in den Skalaren eines ActiveTemplate den erst-passenden `*_WEBHOOK_PATH`-Slot. */
function findWebhookPath(scalars: Record<string, string> | undefined): string | null {
  if (!scalars) return null;
  for (const [key, value] of Object.entries(scalars)) {
    if (key.endsWith('WEBHOOK_PATH') && typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export const ROUTER_TOOLS: RouterTool[] = [
  {
    name: 'answer_from_knowledge',
    description:
      'Liest das Firmenwissen (company_base.md) für Fragen zum Betrieb (Preise, Öffnungszeiten, Leistungen, No-Gos). Nutze es bei Wissensfragen, bevor du rätst.',
    parameters: { type: 'object', properties: {} },
    async execute(ctx) {
      const content = await readWorkspaceFile(ctx.supabase, ctx.projectId, COMPANY_BASE_PATH);
      if (!content.trim()) {
        return { found: false, hint: 'Noch kein Firmenwissen hinterlegt.' };
      }
      return { found: true, content };
    },
  },
  {
    name: 'list_pending_drafts',
    description:
      'Listet Entwürfe/Vorschläge, die auf Freigabe warten (oder schon gesendet/abgebrochen sind), projekt-gescoped. Nutze es bei „was wartet auf mich?", „welche Entwürfe sind offen?".',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'approved', 'sent', 'cancelled'],
          description: 'Filter; Standard "pending".',
        },
      },
    },
    async execute(ctx, args) {
      const status = typeof args.status === 'string' ? args.status : 'pending';
      const { data, error } = await ctx.supabase
        .from('agent_pending_actions')
        .select('id, contact, kind, payload, status, updated_at')
        .eq('project_id', ctx.projectId)
        .eq('status', status)
        .order('updated_at', { ascending: false })
        .limit(20);
      if (error) return { error: error.message };
      const rows = (data ?? []) as Array<{
        id: string;
        kind?: string;
        payload?: Record<string, unknown>;
        updated_at?: string;
      }>;
      return {
        count: rows.length,
        drafts: rows.map((r) => ({
          id: r.id,
          art: r.kind ?? null,
          empfaenger: r.payload?.send_target ?? null,
          betreff: r.payload?.subject ?? null,
          stand: r.updated_at ?? null,
        })),
      };
    },
  },
  {
    name: 'trigger_flow',
    description:
      'Löst einen bei Bernd hinterlegten, bereits deployten Golden-Flow aus (z.B. Angebots-Autopilot, Rechnung & Mahnwesen). Nutze es, wenn der Inhaber eine konkrete Aktion will, die einem Flow entspricht.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Flow-Slug aus lib/bernd/templates.ts, z.B. "angebot-autopilot".' },
        args: { type: 'object', description: 'Optionale Zusatzdaten für den Flow-Webhook.' },
      },
      required: ['slug'],
    },
    async execute(ctx, args) {
      const slug = typeof args.slug === 'string' ? args.slug.trim() : '';
      if (!slug) return { ok: false, hint: 'Flow-Slug fehlt.' };

      const config = await getBerndConfig(ctx.supabase, ctx.projectId);
      const active = config?.active_templates?.find((t) => t.slug === slug);
      if (!active) {
        return { ok: false, hint: `Flow "${slug}" ist bei diesem Betrieb nicht eingerichtet.` };
      }
      const webhookPath = findWebhookPath(active.scalars);
      if (!webhookPath) {
        return {
          ok: false,
          hint: `Flow "${slug}" ist noch nicht deployt (kein Webhook hinterlegt) — bitte im Dashboard einrichten.`,
        };
      }

      const url = `${n8nWebhookBase()}/webhook/${webhookPath}`;
      const flowArgs =
        args.args && typeof args.args === 'object' ? (args.args as Record<string, unknown>) : {};
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: ctx.projectId, ...flowArgs }),
        });
        if (!res.ok) {
          return { ok: false, hint: `Flow-Aufruf fehlgeschlagen (${res.status}).` };
        }
        return { ok: true, slug, triggered: true };
      } catch (e: unknown) {
        return { ok: false, hint: e instanceof Error ? e.message : 'Flow-Aufruf fehlgeschlagen.' };
      }
    },
  },
  {
    name: 'workflow_status',
    description:
      'Letzter Ausführungsstatus eines Flows (oder aller Flows, wenn kein Slug angegeben). Nutze es bei „läuft alles?", „hat der Angebots-Autopilot heute funktioniert?".',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Optionaler Flow-Slug; ohne Angabe werden alle Flows des Projekts geprüft.' },
      },
    },
    async execute(ctx, args) {
      const slug = typeof args.slug === 'string' ? args.slug.trim() : '';

      let query = ctx.supabase
        .from('workflows')
        .select('name, canvas_workflow_id, n8n_workflow_id, status, last_execution_at')
        .eq('project_id', ctx.projectId);
      if (slug) query = query.eq('canvas_workflow_id', slug);
      const { data, error } = await query;
      if (error) return { error: error.message };

      const rows = (data ?? []) as Array<{
        name: string;
        canvas_workflow_id: string | null;
        n8n_workflow_id: string | null;
        status: string | null;
        last_execution_at: string | null;
      }>;
      if (!rows.length) {
        return { found: false, hint: slug ? `Flow "${slug}" nicht gefunden.` : 'Keine Flows gefunden.' };
      }

      const results = await Promise.all(
        rows.map(async (r) => {
          if (!r.n8n_workflow_id) {
            return {
              name: r.name,
              status: r.status,
              letzte_ausfuehrung: r.last_execution_at,
            };
          }
          const executions = await getExecutions(r.n8n_workflow_id).catch(() => []);
          const latest = executions[0];
          return {
            name: r.name,
            status: latest?.status ?? r.status,
            letzte_ausfuehrung: latest?.startedAt ?? r.last_execution_at,
          };
        }),
      );
      return { found: true, flows: results };
    },
  },
];

const ROUTER_TOOL_MAP = new Map(ROUTER_TOOLS.map((t) => [t.name, t]));

/** Tool-Definitionen im Mistral-Function-Format — Arbeits- UND Konfig-Tools. */
export function routerToolsForMistral() {
  const work = ROUTER_TOOLS.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  return [...work, ...configToolsForMistral()];
}

/** Dispatch: Arbeits-Tool direkt ausführen, Konfig-Tool an runConfigTool weiterreichen. */
export async function runRouterTool(
  ctx: BerndToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const workTool = ROUTER_TOOL_MAP.get(name);
  if (workTool) {
    try {
      return await workTool.execute(ctx, args);
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }
  if (CONFIG_TOOLS.some((t) => t.name === name)) {
    const result: ConfigToolResult = await runConfigTool(ctx, name, args);
    return result;
  }
  return { error: `Unbekanntes Tool: ${name}` };
}

export type { BerndToolContext } from '@/lib/bernd/config-tools';
