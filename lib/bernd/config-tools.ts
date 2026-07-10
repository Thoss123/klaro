import type { SupabaseClient } from '@supabase/supabase-js';
import { setNotifyRule, setPriceParam, toggleFlow, updateBerndKnowledge } from '@/lib/bernd/config';
import type { BerndConfig } from '@/lib/bernd/types';

/**
 * Geteilte Konfig-Tool-Schemas (Mistral-Function-Format) über `lib/bernd/config.ts`.
 *
 * WICHTIG: dieser File wird SOWOHL vom Telegram-Router (`lib/bernd/router-tools.ts`) ALS
 * AUCH vom Dashboard-Änderungs-Chat importiert (Architekturplan §2/§5c/§6 Phase 5) — der
 * Contract (Namen/Parameter/Rückgabeform) muss für beide Aufrufer stabil bleiben. Die Tools
 * selbst rufen NUR `lib/bernd/config.ts` auf (keine eigene DB-Logik hier).
 */

export interface ConfigToolResult {
  ok: boolean;
  message: string;
  config?: BerndConfig | null;
}

export interface BerndToolContext {
  supabase: SupabaseClient;
  projectId: string;
  userId: string;
}

interface ConfigToolDef {
  name: string;
  description: string;
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  run: (ctx: BerndToolContext, args: Record<string, unknown>) => Promise<ConfigToolResult>;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export const CONFIG_TOOLS: ConfigToolDef[] = [
  {
    name: 'set_price_param',
    description:
      'Setzt einen Preisparameter von Bernd (z.B. Stundensatz, Materialaufschlag, Anfahrtspauschale). Nutze es, wenn der Inhaber einen konkreten Preiswert ändern will, z.B. „setz meinen Stundensatz auf 95 €".',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Parameter-Key, z.B. "stundensatz", "materialaufschlag", "anfahrtspauschale".',
        },
        value: {
          type: 'string',
          description: 'Neuer Wert als String (z.B. "95", "15%", "45 €").',
        },
      },
      required: ['key', 'value'],
    },
    async run(ctx, args) {
      const key = asString(args.key).trim();
      const value = asString(args.value).trim();
      if (!key || !value) {
        return { ok: false, message: 'Parameter-Key und Wert werden beide benötigt.' };
      }
      const config = await setPriceParam(ctx.supabase, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        key,
        value,
      });
      if (!config) return { ok: false, message: `Preisparameter "${key}" konnte nicht gespeichert werden.` };
      return { ok: true, message: `Preisparameter "${key}" auf "${value}" gesetzt.`, config };
    },
  },
  {
    name: 'set_notify_rule',
    description:
      'Legt fest, ob Bernd bei einer E-Mail-Kategorie aktiv meldet oder stummschaltet (z.B. „bei Rechnungsmails musst du dich nicht melden").',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description:
            'E-Mail-Kategorie aus email/classify: lead_inquiry | scheduling | support_faq | vendor_billing | system_alerts | newsletters | spam_marketing | other.',
        },
        notify: {
          type: 'boolean',
          description: 'true = Bernd meldet sich bei dieser Kategorie, false = stummschalten.',
        },
      },
      required: ['category', 'notify'],
    },
    async run(ctx, args) {
      const category = asString(args.category).trim();
      const notify = args.notify === true;
      if (!category) return { ok: false, message: 'Kategorie fehlt.' };
      const config = await setNotifyRule(ctx.supabase, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        category,
        notify,
      });
      if (!config) return { ok: false, message: `Notify-Regel für "${category}" konnte nicht gespeichert werden.` };
      return {
        ok: true,
        message: notify
          ? `Bernd meldet sich jetzt bei "${category}".`
          : `Bernd meldet sich bei "${category}" nicht mehr.`,
        config,
      };
    },
  },
  {
    name: 'toggle_flow',
    description:
      'Aktiviert oder pausiert einen bei Bernd hinterlegten Flow/Anwendungsfall (z.B. „pausier den Angebots-Autopilot").',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Flow-Slug, z.B. "angebot-autopilot", "rechnung-mahnwesen".' },
        active: { type: 'boolean', description: 'true = aktivieren, false = pausieren.' },
      },
      required: ['slug', 'active'],
    },
    async run(ctx, args) {
      const slug = asString(args.slug).trim();
      const active = args.active === true;
      if (!slug) return { ok: false, message: 'Flow-Slug fehlt.' };
      const config = await toggleFlow(ctx.supabase, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        slug,
        active,
      });
      if (!config) return { ok: false, message: `Flow "${slug}" konnte nicht umgeschaltet werden.` };
      return {
        ok: true,
        message: active ? `Flow "${slug}" ist jetzt aktiv.` : `Flow "${slug}" ist jetzt pausiert.`,
        config,
      };
    },
  },
  {
    name: 'update_bernd_knowledge',
    description:
      'Aktualisiert eine Bernd-Wissensdatei (Firmenwissen, Textbausteine, Persona) im Arbeitsbereich. Nutze es für inhaltliche Ergänzungen/Korrekturen, NICHT für einzelne Preisparameter (dafür set_price_param).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Workspace-Pfad, z.B. "rules/company_base.md" oder "rules/persona_default.md".',
        },
        content: { type: 'string', description: 'Kompletter neuer Dateiinhalt (kein Diff, kein Append).' },
      },
      required: ['path', 'content'],
    },
    async run(ctx, args) {
      const path = asString(args.path).trim();
      const content = asString(args.content);
      if (!path || !content.trim()) {
        return { ok: false, message: 'Pfad und Inhalt werden beide benötigt.' };
      }
      const file = await updateBerndKnowledge(ctx.supabase, {
        userId: ctx.userId,
        projectId: ctx.projectId,
        path,
        content,
        updatedBy: 'bernd_router',
      });
      if (!file) return { ok: false, message: `Datei "${path}" konnte nicht gespeichert werden.` };
      return { ok: true, message: `Wissensdatei "${path}" aktualisiert.` };
    },
  },
];

const CONFIG_TOOL_MAP = new Map(CONFIG_TOOLS.map((t) => [t.name, t]));

/** Tool-Definitionen im Mistral-Function-Format. */
export function configToolsForMistral() {
  return CONFIG_TOOLS.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

/** Dispatch eines Konfig-Tool-Aufrufs anhand des Namens. */
export async function runConfigTool(
  ctx: BerndToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ConfigToolResult> {
  const tool = CONFIG_TOOL_MAP.get(name);
  if (!tool) return { ok: false, message: `Unbekanntes Konfig-Tool: ${name}` };
  try {
    return await tool.run(ctx, args);
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
