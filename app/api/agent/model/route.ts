import { NextRequest, NextResponse } from 'next/server';
import { resolveCaller } from '@/lib/machine-auth';
import { completeChat, type ProxyChatMessage } from '@/lib/agents/model-proxy';

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
 * Die eigentliche Mistral-Call/Credit-Logik lebt in lib/agents/model-proxy.ts — geteilt
 * mit den OpenAI-kompatiblen Routen unter /api/agent/v1/* (für n8n-Nodes, die eine
 * openAiApi-Credential mit custom Base-URL erwarten, z.B. lmChatOpenAi).
 *
 * POST /api/agent/model
 *   { project_id, messages:[{role,content,tool_calls?,tool_call_id?,name?}], model?, tools?, tool_choice? }
 *   → { message: {role, content, tool_calls?}, model, usage }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { project_id, messages, model, tools, tool_choice } = body as {
    project_id?: string;
    messages?: ProxyChatMessage[];
    model?: string;
    tools?: unknown[];
    tool_choice?: string;
  };

  const caller = await resolveCaller(req, project_id ?? null);
  if ('error' in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!project_id || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'project_id and messages[] required' }, { status: 400 });
  }

  const result = await completeChat({
    userId: caller.userId,
    projectId: project_id,
    messages,
    model,
    tools,
    toolChoice: tool_choice,
    action: 'agent_model',
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    message: { role: result.message.role, content: result.message.content, tool_calls: result.message.toolCalls },
    model: result.model,
    usage: result.usage,
  });
}
