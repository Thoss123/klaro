import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import { resolveCaller } from '@/lib/machine-auth';
import { resolveAgentPrompt } from '@/lib/agent-prompts';
import { withRateLimitRetry } from '@/lib/agents/llm';
import { canAfford, debitFromUsage } from '@/lib/billing/credits';

export const maxDuration = 60;

/**
 * Zentraler LLM-Endpunkt für die Agenten-Workflows (n8n → App).
 *
 * Warum durch die App statt direkter Mistral-Nodes in n8n:
 *  - Axantilos zentraler Mistral-Key (User hinterlegt nichts)
 *  - Credit-Abrechnung pro Aufruf via debitFromUsage (wie der Chat)
 *  - Prompts: Standard aus lib/agent-prompts.ts, per User-Workspace überschreibbar
 *  - Regeln (Firmenwissen + Persona) werden serverseitig injiziert
 *
 * POST /api/agent/llm
 *   { project_id, prompt_key, user, persona_path?, variables? }
 *   → { text, model, usage, customized }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { project_id, prompt_key, user, persona_path, variables } = body as {
    project_id?: string;
    prompt_key?: string;
    user?: string;
    persona_path?: string;
    variables?: Record<string, string>;
  };

  const caller = await resolveCaller(req, project_id ?? null);
  if ('error' in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!project_id || !prompt_key || !user?.trim()) {
    return NextResponse.json({ error: 'project_id, prompt_key, user required' }, { status: 400 });
  }

  // Credits prüfen — gleiche Schranke wie der Chat.
  const affordability = await canAfford(caller.userId, 1);
  if (!affordability.ok) {
    return NextResponse.json(
      { error: 'INSUFFICIENT_CREDITS', message: 'Credit-Guthaben aufgebraucht — bitte in Axantilo aufladen.' },
      { status: 402 },
    );
  }

  let resolved;
  try {
    resolved = await resolveAgentPrompt(caller.supabase, {
      projectId: project_id,
      key: prompt_key,
      personaPath: persona_path,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'prompt resolution failed' }, { status: 400 });
  }

  // Zusätzliche Skalar-Variablen des Aufrufers ({{name}} → Wert) in System-Prompt einsetzen.
  let system = resolved.system;
  for (const [k, v] of Object.entries(variables ?? {})) {
    system = system.replaceAll(`{{${k}}}`, String(v));
  }
  // Fail-safe: nicht gelieferte Aufrufer-Variablen (lowercase-Platzhalter) neutralisieren,
  // damit nie ein roher {{platzhalter}} beim LLM landet.
  system = system.replace(/\{\{\s*[a-z][a-z0-9_]*\s*\}\}/g, '(nicht verfügbar)');

  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: 'MISTRAL_API_KEY not configured' }, { status: 500 });

  try {
    const client = new Mistral({ apiKey });
    const res = await withRateLimitRetry(() =>
      client.chat.complete({
        model: resolved.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        ...(resolved.json ? { responseFormat: { type: 'json_object' as const } } : {}),
      }),
    );

    const raw = res.choices?.[0]?.message?.content;
    const text = typeof raw === 'string' ? raw : '';
    const usage = {
      promptTokens: res.usage?.promptTokens ?? null,
      completionTokens: res.usage?.completionTokens ?? null,
      totalTokens: res.usage?.totalTokens ?? null,
    };

    // Credits abbuchen — fail-open wie im Chat (Fehler blockiert die Antwort nicht).
    await debitFromUsage({
      userId: caller.userId,
      usage,
      model: resolved.model,
      action: `agent_${prompt_key.replace(/\//g, '_')}`,
      projectId: project_id,
      metadata: { prompt_key, customized: resolved.customized },
    }).catch((e) =>
      console.warn('[agent/llm] credit debit failed:', e instanceof Error ? e.message : String(e)),
    );

    return NextResponse.json({ text, model: resolved.model, usage, customized: resolved.customized });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[agent/llm] Mistral call failed:', msg);
    return NextResponse.json({ error: `LLM call failed: ${msg}` }, { status: 502 });
  }
}
