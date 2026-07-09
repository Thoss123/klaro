import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export type DataLayerRecord = {
  id: string;
  user_id: string;
  project_id: string;
  source_type: 'supabase' | 'custom' | string;
  source_name: string | null;
  auto_provisioned: boolean;
  notes: string | null;
  created_at: string;
};

/**
 * Idempotent: returns existing data layer or auto-provisions a new Supabase one.
 * Called after Phase 2 completes and before every workflow deploy.
 */
export async function ensureDataLayer(
  userId: string,
  projectId: string,
): Promise<DataLayerRecord | null> {
  const supabase = await createSupabaseServerClient();
  return ensureDataLayerWithClient(supabase, userId, projectId);
}

/**
 * Wie `ensureDataLayer`, nimmt aber einen bereits aufgelösten Client entgegen — für
 * Aufrufer, die schon einen Service-/Anon-Client haben (z. B. `resolveCaller`-Ergebnis
 * bei Maschinen-Aufrufen, wo `createSupabaseServerClient()` keine Cookie-Session findet).
 */
export async function ensureDataLayerWithClient(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<DataLayerRecord | null> {
  try {
    const { data: existing } = await supabase
      .from('user_data_layer')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) return existing as DataLayerRecord;

    const { data: created, error } = await supabase
      .from('user_data_layer')
      .insert({
        user_id: userId,
        project_id: projectId,
        source_type: 'supabase',
        auto_provisioned: true,
      })
      .select()
      .single();

    if (error || !created) {
      console.error('[data-layer] provisioning failed:', error?.message);
      return null;
    }

    // Default table: stores generic automation output data
    await supabase.from('user_data_tables').insert({
      layer_id: created.id,
      user_id: userId,
      project_id: projectId,
      table_name: 'automation_data',
      display_name: 'Automationsdaten',
      description: 'Automatisch von Axantilo angelegt — hier speichern eure Automationen Daten.',
      schema_def: [],
    });

    console.log(`[data-layer] provisioned for project ${projectId}`);
    return created as DataLayerRecord;
  } catch (e: unknown) {
    console.error('[data-layer] ensureDataLayer error:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

export type DataTableRecord = {
  id: string;
  layer_id: string;
  user_id: string;
  project_id: string;
  table_name: string;
  display_name: string;
  description: string | null;
  schema_def: unknown;
  row_count: number;
  created_at: string;
};

/**
 * Findet oder legt (idempotent) die `user_data_tables`-Zeile für einen logischen Tabellennamen
 * an. Stellt vorher sicher, dass die Datenablage selbst existiert (`ensureDataLayer`).
 * Genutzt von `/api/agent/data`, damit n8n-Workflows Tabellen einfach per Name ansprechen
 * können, ohne vorher manuell etwas in Supabase anzulegen.
 */
export async function getOrCreateTable(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  tableName: string,
): Promise<DataTableRecord | null> {
  const { data: existing } = await supabase
    .from('user_data_tables')
    .select('*')
    .eq('project_id', projectId)
    .eq('table_name', tableName)
    .maybeSingle();

  if (existing) return existing as DataTableRecord;

  const layer = await ensureDataLayerWithClient(supabase, userId, projectId);
  if (!layer) return null;

  const { data: created, error } = await supabase
    .from('user_data_tables')
    .insert({
      layer_id: layer.id,
      user_id: userId,
      project_id: projectId,
      table_name: tableName,
      display_name: tableName,
      schema_def: [],
    })
    .select()
    .single();

  if (error || !created) {
    console.error('[data-layer] getOrCreateTable insert failed:', error?.message);
    return null;
  }

  return created as DataTableRecord;
}

/** Human-readable summary string for coach context injection. */
export function formatDataLayerForPrompt(
  layer: Pick<DataLayerRecord, 'source_type' | 'source_name' | 'auto_provisioned'> | null | undefined,
): string {
  if (!layer) return 'Noch nicht erfasst — in Phase 2 klären.';
  if (layer.source_type === 'custom' && layer.source_name) {
    return `${layer.source_name} (eigene Lösung des Nutzers — Automationen daran anknüpfen)`;
  }
  if (layer.source_type === 'supabase' && layer.auto_provisioned) {
    return 'Axantilo Datenablage (automatisch eingerichtet, kein Aufwand für den Nutzer — Workflows können Daten direkt dort ablegen)';
  }
  if (layer.source_type === 'supabase') {
    return 'Axantilo Datenablage (Supabase)';
  }
  return layer.source_name ?? layer.source_type;
}
