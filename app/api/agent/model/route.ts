import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import { resolveCaller } from '@/lib/machine-auth';
import { withRateLimitRetry } from '@/lib/agents/llm';
import { canAfford, debitFromUsage } from '@/lib/billing/credits';

export const maxDuration = 90;

/**
 * Generischer, gemeterter Mistral-Chat-Proxy — das Modell hinter der „Axantilo Chat Model"-
 * n8n-Node. Stateless: n8n (der native AI-Agent) führt die Tool-Schleife und ruft diesen
 * Endpunkt PRO Runde mit messages (+ optional tools). Wir geben die Assistant-Antwort
 * inkl. tool_calls zurück und ziehen die Token JEDER Runde als Credits ab.
 *
 * So bleibt der Mistral-Key server-only (nie in n8n sichtbar) und die Abrechnung ist
 * zuverlässig, auch über mehrere Agent-Runden.
 *
 * POST /api/agent/model
 *   { project_id, messages:[{role,content,tool_calls?,tool_call_id?,name?}], model?, tools?, tool_choice? }
 *   → { message: {role, content, tool_calls?}, model, usage }
 */
type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: unknown;
  toolCallId?: string;
  name?: string;
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { project_id, messages, model, tools, tool_choice } = body as {
    project_id?: string;
    messages?: ChatMessage[];
    model?: string;
    tools?: unknown[];
    tool_choice?: string;
  };

  const caller = await resolveCaller(req, project_id ?? null);
  if ('error' in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!project_id || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'project_id and messages[] required' }, { status: 400 });
  }

  const affordability = await canAfford(caller.userId, 1);
  if (!affordability.ok) {
    return NextResponse.json({ error: 'INSUFFICIENT_CREDITS' }, { status: 402 });
  }

  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: 'MISTRAL_API_KEY not configured' }, { status: 500 });
  const chatModel = model?.trim() || process.env.MISTRAL_CHAT_MODEL || 'mistral-medium-latest';

  try {
    const client = new Mistral({ apiKey });
    const res = await withRateLimitRetry(() =>
      client.chat.complete({
        model: chatModel,
        // Nachrichten/Tools werden 1:1 durchgereicht (n8n/LangChain liefert Mistral-Format).
        messages: messages as never,
        ...(Array.isArray(tools) && tools.length ? { tools: tools as never, toolChoice: (tool_choice ?? 'auto') as never } : {}),
      }),
    );

    const choice = res.choices?.[0]?.message;
    const usage = {
      promptTokens: res.usage?.promptTokens ?? null,
      completionTokens: res.usage?.completionTokens ?? null,
      totalTokens: res.usage?.totalTokens ?? null,
    };

    await debitFromUsage({
      userId: caller.userId,
      usage,
      model: chatModel,
      action: 'agent_model',
      projectId: project_id,
      metadata: { rounds: 1 },
    }).catch((e) => console.warn('[agent/model] debit failed:', e instanceof Error ? e.message : String(e)));

    return NextResponse.json({
      message: {
        role: 'assistant',
        content: typeof choice?.content === 'string' ? choice.content : '',
        tool_calls: choice?.toolCalls ?? null,
      },
      model: chatModel,
      usage,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[agent/model] failed:', msg);
    return NextResponse.json({ error: `model call failed: ${msg}` }, { status: 502 });
  }
}
