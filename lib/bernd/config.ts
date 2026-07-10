import type { SupabaseClient } from '@supabase/supabase-js';
import { writeWorkspaceFile } from '@/lib/workspace';
import type { ActiveTemplate, BerndConfig, NotifyRules } from '@/lib/bernd/types';

/**
 * Geteilte Konfig-Mutations-Schicht für Bernd (DI-Muster wie `lib/workspace.ts`: jede
 * Funktion nimmt den Supabase-Client als Parameter). Diese Datei wird sowohl vom
 * Dashboard-Änderungs-Chat als auch vom Telegram-Router genutzt (Architekturplan §2/§5c) —
 * eine Konfig-Logik, zwei Aufrufer. Read-modify-write für jsonb-Merges bewusst sequenziell
 * (erst laden, dann mergen, dann upsert) statt DB-seitigem jsonb-Merge, damit die
 * Merge-Regeln (z.B. Listen deduplizieren) in TypeScript nachvollziehbar bleiben.
 */

/** Bernd-Config eines Projekts laden, oder `null` wenn noch keine existiert (Onboarding nicht abgeschlossen). */
export async function getBerndConfig(
  supabase: SupabaseClient,
  projectId: string,
): Promise<BerndConfig | null> {
  const { data, error } = await supabase
    .from('bernd_configs')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) {
    console.error('[bernd/config] getBerndConfig failed:', error.message);
    return null;
  }
  return (data as BerndConfig | null) ?? null;
}

/**
 * Bernd-Config anlegen/aktualisieren (Upsert auf `project_id`). `patch` wird flach auf die
 * bestehende Zeile gemerged (Onboarding-Feld für Onboarding-Feld); für die jsonb-Spalten
 * selbst (preislogik/notify_rules/...) siehe die spezialisierten Setter unten, die
 * feingranular mergen statt zu überschreiben.
 */
export async function upsertBerndConfig(
  supabase: SupabaseClient,
  args: { userId: string; projectId: string; patch: Partial<BerndConfig> },
): Promise<BerndConfig | null> {
  const { userId, projectId, patch } = args;
  const { data, error } = await supabase
    .from('bernd_configs')
    .upsert(
      {
        ...patch,
        project_id: projectId,
        user_id: userId,
      },
      { onConflict: 'project_id' },
    )
    .select()
    .single();

  if (error || !data) {
    console.error('[bernd/config] upsertBerndConfig failed:', error?.message);
    return null;
  }
  return data as BerndConfig;
}

/** Einen Preisparameter setzen (mergt in `preislogik`, z.B. { stundensatz: 95 }). */
export async function setPriceParam(
  supabase: SupabaseClient,
  args: { userId: string; projectId: string; key: string; value: unknown },
): Promise<BerndConfig | null> {
  const existing = await getBerndConfig(supabase, args.projectId);
  const preislogik = { ...(existing?.preislogik ?? {}), [args.key]: args.value };

  return upsertBerndConfig(supabase, {
    userId: args.userId,
    projectId: args.projectId,
    patch: { preislogik },
  });
}

/**
 * Notify-Regel für eine E-Mail-Kategorie setzen/entfernen (pflegt
 * `notify_rules.email_categories_notify` bzw. `.mute`, z.B. "bei Rechnungsmails nicht melden").
 * `notify=true` nimmt die Kategorie in die Notify-Liste auf und entfernt sie aus der Mute-Liste
 * (und umgekehrt bei `notify=false`) — beide Listen bleiben so immer disjunkt.
 */
export async function setNotifyRule(
  supabase: SupabaseClient,
  args: { userId: string; projectId: string; category: string; notify: boolean },
): Promise<BerndConfig | null> {
  const existing = await getBerndConfig(supabase, args.projectId);
  const current: NotifyRules = existing?.notify_rules ?? {};
  const notifyList = new Set(current.email_categories_notify ?? []);
  const muteList = new Set(current.mute ?? []);

  if (args.notify) {
    notifyList.add(args.category);
    muteList.delete(args.category);
  } else {
    muteList.add(args.category);
    notifyList.delete(args.category);
  }

  const notify_rules: NotifyRules = {
    ...current,
    email_categories_notify: Array.from(notifyList),
    mute: Array.from(muteList),
  };

  return upsertBerndConfig(supabase, {
    userId: args.userId,
    projectId: args.projectId,
    patch: { notify_rules },
  });
}

/**
 * Einen Flow in `active_templates` aktivieren/deaktivieren (setzt nur den DB-State — ruft
 * KEIN n8n auf; die n8n-Aktivierung/Deaktivierung übernimmt der Aufrufer separat, z.B. über
 * `lib/n8n.ts`, nachdem dieser Zustand hier gespeichert ist).
 */
export async function toggleFlow(
  supabase: SupabaseClient,
  args: { userId: string; projectId: string; slug: string; active: boolean },
): Promise<BerndConfig | null> {
  const existing = await getBerndConfig(supabase, args.projectId);
  const templates: ActiveTemplate[] = existing?.active_templates ?? [];

  const idx = templates.findIndex((t) => t.slug === args.slug);
  let active_templates: ActiveTemplate[];
  if (idx === -1) {
    // Flow war noch nicht in der Liste — nur relevant, wenn aktiviert werden soll.
    active_templates = args.active ? [...templates, { slug: args.slug }] : templates;
  } else if (args.active) {
    active_templates = templates;
  } else {
    // Deaktivieren entfernt den Eintrag nicht (Skalare/n8n_workflow_id bleiben erhalten,
    // damit ein Re-Aktivieren nicht neu parametrisiert werden muss) — daher Overlay-Feld.
    active_templates = templates.map((t) =>
      t.slug === args.slug ? { ...t, scalars: { ...t.scalars } } : t,
    );
  }

  return upsertBerndConfig(supabase, {
    userId: args.userId,
    projectId: args.projectId,
    patch: { active_templates },
  });
}

/**
 * Dünner Wrapper um `writeWorkspaceFile` (lib/workspace.ts) — hält "Bernds Wissen" (Regeln,
 * Textbausteine, Persona) im selben Arbeitsbereich wie den Rest der Firmen-Automation,
 * statt eine zweite Speicherform für Bernd-Wissen einzuführen.
 */
export async function updateBerndKnowledge(
  supabase: SupabaseClient,
  args: { userId: string; projectId: string; path: string; content: string; updatedBy?: string },
) {
  return writeWorkspaceFile(supabase, {
    userId: args.userId,
    projectId: args.projectId,
    path: args.path,
    content: args.content,
    updatedBy: args.updatedBy,
  });
}
