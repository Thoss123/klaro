import type { SupabaseClient } from '@supabase/supabase-js';
import { createN8nCredential } from '@/lib/n8n';

/**
 * Pro-Projekt-Provisionierung der „Axantilo AI"-n8n-Credential — bindet n8n's
 * `lmChatOpenAi`-Sub-Node (openAiApi-Credential mit custom Base-URL) an unseren
 * gemeterten Mistral-Proxy (/api/agent/v1/*). Anders als die zentralen Credentials in
 * lib/central-credentials.ts (EINE geteilte ID für alle User) ist diese Credential pro
 * Projekt eindeutig, weil der API-Key das Projekt selbst kodiert
 * (`<WORKSPACE_API_TOKEN>.<project_id>` — siehe lib/machine-auth.ts#resolveOpenAiCaller).
 */

/** tool_name-Schlüssel in user_credentials für die Axantilo-eigene LLM-Credential. */
export const AXANTILO_AI_TOOL = 'axantilo_ai';

/** True, wenn dieser Tool-Schlüssel die zentral verwaltete Axantilo-Chat-Model-Credential ist. */
export function isAxantiloAiTool(tool: string | null | undefined): boolean {
  return tool === AXANTILO_AI_TOOL;
}

function mockN8n(): boolean {
  return process.env.MOCK_N8N === 'true';
}

/** Kurzer, stabiler Projekt-Suffix für den Credential-Namen (Lesbarkeit in der n8n-UI). */
function projectShort(projectId: string): string {
  return projectId.replace(/-/g, '').slice(0, 8);
}

/**
 * Idempotent: existiert für (user_id, project_id, tool_name='axantilo_ai') bereits eine
 * n8n-Credential-ID in user_credentials, wird sie zurückgegeben. Sonst wird die Credential
 * in n8n angelegt (Typ `openAiApi`, Base-URL auf unseren Proxy) und gespeichert.
 *
 * `appBaseUrl` ist die öffentlich erreichbare Origin der App (siehe lib/app-origin.ts /
 * lib/deploy-agent-workflow.ts für dasselbe Muster — `new URL(req.url).origin` bzw.
 * getRequestOrigin(req) im Aufrufer).
 */
export async function ensureAxantiloLlmCredential(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  appBaseUrl: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('user_credentials')
    .select('n8n_credential_id')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('tool_name', AXANTILO_AI_TOOL)
    .eq('status', 'active')
    .maybeSingle();

  const existingId = existing?.n8n_credential_id as string | undefined;
  if (existingId) return existingId;

  const workspaceToken = process.env.WORKSPACE_API_TOKEN?.trim();
  if (!workspaceToken) {
    console.error('[axantilo-llm-credential] WORKSPACE_API_TOKEN not configured — cannot provision credential');
    return null;
  }

  const apiKey = `${workspaceToken}.${projectId}`;
  const baseUrl = `${appBaseUrl.replace(/\/$/, '')}/api/agent/v1`;

  let credentialId: string;
  if (mockN8n()) {
    credentialId = `mock_cred_axantilo_ai_${Date.now()}`;
  } else {
    try {
      const cred = await createN8nCredential({
        name: `AXANTILO AI (${projectShort(projectId)})`,
        type: 'openAiApi',
        data: { apiKey, url: baseUrl },
      });
      credentialId = cred.id;
    } catch (e) {
      console.error('[axantilo-llm-credential] n8n credential creation failed:', e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  const { error: upsertError } = await supabase
    .from('user_credentials')
    .upsert({
      user_id: userId,
      project_id: projectId,
      tool_name: AXANTILO_AI_TOOL,
      // credential_type-Spalte ist ein CHECK('api_key'|'oauth') — der n8n-Credential-TYP
      // (openAiApi) steckt separat in lib/workflow-generator.ts CREDENTIAL_TYPE/StepMapping.
      credential_type: 'api_key',
      n8n_credential_id: credentialId,
      status: 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,project_id,tool_name' });

  if (upsertError) {
    console.error('[axantilo-llm-credential] user_credentials upsert failed:', upsertError.message);
    return null;
  }

  return credentialId;
}
