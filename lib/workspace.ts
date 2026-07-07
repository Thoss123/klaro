import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Workspace-Store: virtuelles Filesystem pro Projekt (DB-Tabelle `workspace_files`).
 * Hält die Agent-Regel-Dateien, die der n8n-Agent zur Laufzeit liest und Flow 2
 * konsolidierend umschreibt. `path`-Präfix = Verzeichnis ('rules/…').
 *
 * Alle Helper nehmen den Supabase-Client als Parameter (Dependency Injection) —
 * so funktionieren sie mit dem Cookie-Client (App-UI) wie mit dem Service-Client
 * (n8n via HTTP) und sind ohne echte DB testbar.
 */

export type WorkspaceFile = {
  id: string;
  user_id: string;
  project_id: string;
  path: string;
  content: string;
  version: number;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

export const RULES_DIR = 'rules';
export const COMPANY_BASE_PATH = 'rules/company_base.md';

/** Kanonischer Pfad einer Persona-Regel-Datei ('rules/persona_thomas.md'). */
export function personaPath(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `rules/persona_${slug || 'default'}.md`;
}

/** Inhalt einer Datei lesen; '' wenn sie (noch) nicht existiert. */
export async function readWorkspaceFile(
  supabase: SupabaseClient,
  projectId: string,
  path: string,
): Promise<string> {
  const { data } = await supabase
    .from('workspace_files')
    .select('content')
    .eq('project_id', projectId)
    .eq('path', path)
    .maybeSingle();
  return (data?.content as string | undefined) ?? '';
}

/** Alle Dateien unter einem Pfad-Präfix auflisten (virtuelles Verzeichnis). */
export async function listWorkspaceFiles(
  supabase: SupabaseClient,
  projectId: string,
  prefix?: string,
): Promise<Pick<WorkspaceFile, 'path' | 'version' | 'updated_at'>[]> {
  let query = supabase
    .from('workspace_files')
    .select('path, version, updated_at')
    .eq('project_id', projectId);
  if (prefix) query = query.like('path', `${prefix}%`);
  const { data } = await query;
  return (data as Pick<WorkspaceFile, 'path' | 'version' | 'updated_at'>[] | null) ?? [];
}

/**
 * Datei schreiben (Upsert). Bestehende Datei wird überschrieben; `version` zählt der
 * DB-Trigger `workspace_files_bump_version` beim UPDATE automatisch hoch — daher wird
 * `version` bewusst NICHT im Payload gesetzt (Insert nutzt Default 1).
 */
export async function writeWorkspaceFile(
  supabase: SupabaseClient,
  args: { userId: string; projectId: string; path: string; content: string; updatedBy?: string },
): Promise<WorkspaceFile | null> {
  const { data, error } = await supabase
    .from('workspace_files')
    .upsert(
      {
        user_id: args.userId,
        project_id: args.projectId,
        path: args.path,
        content: args.content,
        updated_by: args.updatedBy ?? 'system',
      },
      { onConflict: 'project_id,path' },
    )
    .select()
    .single();

  if (error || !data) {
    console.error('[workspace] writeWorkspaceFile failed:', error?.message);
    return null;
  }
  return data as WorkspaceFile;
}

/** Vorlage für die firmenweite Basis-Regel-Datei beim Onboarding. */
export function buildBaseRulesTemplate(strategy?: string): string {
  const strategyBlock = strategy?.trim()
    ? `\n## Ausgangswissen (aus Onboarding & Recherche)\n${strategy.trim()}\n`
    : '';
  return `# Firmen-Basiswissen

Diese Datei ist das gemeinsame Faktenwissen für alle Antwort-Entwürfe (Öffnungszeiten,
Preise, FAQs, Stornobedingungen, No-Gos). Der Agent liest sie bei jedem Entwurf; Flow 2
ergänzt und konsolidiert sie automatisch aus gesendeten Mails.
${strategyBlock}
## Fakten
- (wird automatisch befüllt)

## No-Gos
- (wird automatisch befüllt)
`;
}

/**
 * Idempotent: legt `rules/company_base.md` beim ersten Mal an (vorbefüllt aus der
 * Strategie), sonst passiert nichts. Aufruf beim Onboarding / nach der Firmen-Recherche.
 */
export async function ensureBaseRules(
  supabase: SupabaseClient,
  args: { userId: string; projectId: string; strategy?: string },
): Promise<WorkspaceFile | null> {
  const { data: existing } = await supabase
    .from('workspace_files')
    .select('*')
    .eq('project_id', args.projectId)
    .eq('path', COMPANY_BASE_PATH)
    .maybeSingle();
  if (existing) return existing as WorkspaceFile;

  return writeWorkspaceFile(supabase, {
    userId: args.userId,
    projectId: args.projectId,
    path: COMPANY_BASE_PATH,
    content: buildBaseRulesTemplate(args.strategy),
    updatedBy: 'axantilo',
  });
}
