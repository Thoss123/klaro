import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import { resolveCaller } from '@/lib/machine-auth';
import { resolveAgentPrompt } from '@/lib/agent-prompts';
import { withRateLimitRetry } from '@/lib/agents/llm';
import { canAfford, debitFromUsage } from '@/lib/billing/credits';
import {
  ASSISTANT_TOOLS,
  assistantToolsForMistral,
  getServerTool,
  type ToolContext,
} from '@/lib/agent-tools-server';

export const maxDuration = 90;

const MAX_TOOL_ROUNDS = 4;

type MistralMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
};

/**
 * Freier Assistent im Steuerkanal (WhatsApp/Slack/Teams) mit Tool-Nutzung.
 *
 * Die Function-Calling-Schleife läuft komplett server-seitig: Mistral entscheidet, welches
 * Tool es braucht, die App führt es aus (eigene DB-Tools sofort, Kalender/CRM über n8n-Tool-
 * Webhooks), und die Token ALLER Runden werden summiert und einmal als Credits abgezogen.
 *
 * POST /api/agent/assistant  { project_id, user, persona_path? } → { text, model, usage, tools_used }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { project_id, user, persona_path } = body as {
    project_id?: string;
    user?: string;
    persona_path?: string;
  };

  const caller = await resolveCaller(req, project_id ?? null);
  if ('error' in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!project_id || !user?.trim()) {
    return NextResponse.json({ error: 'project_id, user required' }, { status: 400 });
  }

  const affordability = await canAfford(caller.userId, 1);
  if (!affordability.ok) {
    return NextResponse.json(
      { error: 'INSUFFICIENT_CREDITS', message: 'Credit-Guthaben aufgebraucht.' },
      { status: 402 },
    );
  }

  const resolved = await resolveAgentPrompt(caller.supabase, {
    projectId: project_id,
    key: 'control/adhoc',
    personaPath: persona_path,
  }).catch(() => null);
  if (!resolved) return NextResponse.json({ error: 'prompt resolution failed' }, { status: 400 });

  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: 'MISTRAL_API_KEY not configured' }, { status: 500 });

  const client = new Mistral({ apiKey });
  const ctx: ToolContext = { supabase: caller.supabase, projectId: project_id };
  const toolNames = ASSISTANT_TOOLS.map((t) => t.name).join(', ');

  const messages: MistralMessage[] = [
    { role: 'system', content: `${resolved.system}\n\nDu hast Werkzeuge (${toolNames}). Nutze sie NUR, wenn die Frage aktuelle Daten braucht (offene Entwürfe, Termine, CRM). Für allgemeine Fragen antworte direkt aus dem Firmenwissen. Fasse Tool-Ergebnisse kurz und im Chat-Ton zusammen.` },
    { role: 'user', content: user },
  ];

  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const toolsUsed: string[] = [];
  let finalText = '';

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const lastRound = round === MAX_TOOL_ROUNDS;
      const res = await withRateLimitRetry(() =>
        client.chat.complete({
          model: resolved.model,
          messages,
          // In der letzten Runde keine Tools mehr anbieten → erzwingt eine Text-Antwort.
          ...(lastRound ? {} : { tools: assistantToolsForMistral(), toolChoice: 'auto' }),
        }),
      );

      usage.promptTokens += res.usage?.promptTokens ?? 0;
      usage.completionTokens += res.usage?.completionTokens ?? 0;
      usage.totalTokens += res.usage?.totalTokens ?? 0;

      const msg = res.choices?.[0]?.message;
      const toolCalls = msg?.toolCalls ?? [];
      const contentStr = typeof msg?.content === 'string' ? msg.content : '';

      if (!toolCalls.length || lastRound) {
        finalText = contentStr;
        break;
      }

      // Assistant-Nachricht MIT toolCalls, dann pro Aufruf eine tool-Antwort (Mistral-Reihenfolge).
      messages.push({
        role: 'assistant',
        content: contentStr,
        toolCalls: toolCalls.map((tc) => ({
          id: tc.id ?? '',
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments as string },
        })),
      });

      for (const tc of toolCalls) {
        const name = tc.function.name;
        toolsUsed.push(name);
        let result: unknown;
        try {
          const tool = getServerTool(name);
          const rawArgs = (tc.function.arguments as string) || '{}';
          const args = JSON.parse(rawArgs) as Record<string, unknown>;
          result = tool ? await tool.execute(ctx, args) : { error: `Unbekanntes Tool: ${name}` };
        } catch (e) {
          result = { error: e instanceof Error ? e.message : 'tool failed' };
        }
        messages.push({
          role: 'tool',
          name,
          toolCallId: tc.id ?? '',
          content: JSON.stringify(result),
        });
      }
    }

    await debitFromUsage({
      userId: caller.userId,
      usage,
      model: resolved.model,
      action: 'agent_control_adhoc',
      projectId: project_id,
      metadata: { tools_used: toolsUsed, customized: resolved.customized },
    }).catch((e) =>
      console.warn('[agent/assistant] credit debit failed:', e instanceof Error ? e.message : String(e)),
    );

    return NextResponse.json({
      text: finalText || 'Dazu habe ich gerade keine Antwort gefunden.',
      model: resolved.model,
      usage,
      tools_used: toolsUsed,
      customized: resolved.customized,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[agent/assistant] failed:', msg);
    return NextResponse.json({ error: `assistant failed: ${msg}` }, { status: 502 });
  }
}
