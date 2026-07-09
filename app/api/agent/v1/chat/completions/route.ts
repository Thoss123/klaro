import { NextRequest, NextResponse } from 'next/server';
import { resolveOpenAiCaller } from '@/lib/machine-auth';
import { checkAffordable, getMistralClient, meterUsage, type ProxyUsage } from '@/lib/agents/model-proxy';
import { withRateLimitRetry } from '@/lib/agents/llm';
import {
  buildOpenAiCompletionResponse,
  mistralFinishReasonToOpenAi,
  newCompletionId,
  openAiError,
  resolveRequestedModel,
  toMistralMessages,
  toMistralToolChoice,
  usageToOpenAi,
  type OpenAiChatCompletionRequest,
  type OpenAiToolCallDelta,
} from '@/lib/agents/openai-compat';

export const maxDuration = 90;

/**
 * OpenAI-kompatible Chat-Completions — das Ziel der `openAiApi`-Credential, die per
 * ensureAxantiloLlmCredential() an n8n's `lmChatOpenAi`-Sub-Node gebunden wird. n8n
 * (LangChain ChatOpenAI) führt den eigentlichen Agent-Tool-Loop selbst; wir sind nur
 * das gemeterte Mistral-Backend dahinter (Key bleibt server-only).
 *
 * Auth: `Authorization: Bearer <WORKSPACE_API_TOKEN>.<project_id>` — siehe
 * lib/machine-auth.ts#resolveOpenAiCaller (OpenAI-Format hat keinen project_id-Body-Slot,
 * daher steckt das Projekt im Key selbst).
 *
 * POST /api/agent/v1/chat/completions — Standard-OpenAI-Request/Response-Shape.
 */
export async function POST(req: NextRequest) {
  const caller = await resolveOpenAiCaller(req);
  if ('error' in caller) {
    const status = caller.status;
    const type = status === 401 ? 'authentication_error' : status === 404 ? 'invalid_request_error' : 'api_error';
    return NextResponse.json(openAiError(caller.error, type), { status });
  }

  const body = await req.json().catch(() => null) as OpenAiChatCompletionRequest | null;
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(openAiError('messages[] required', 'invalid_request_error'), { status: 400 });
  }

  const affordable = await checkAffordable(caller.userId);
  if (!affordable) {
    return NextResponse.json(
      openAiError('Insufficient credits', 'insufficient_quota', 'INSUFFICIENT_CREDITS'),
      { status: 402 },
    );
  }

  const client = getMistralClient();
  if (!client) {
    return NextResponse.json(openAiError('MISTRAL_API_KEY not configured', 'api_error'), { status: 500 });
  }

  const model = resolveRequestedModel(body.model);
  const messages = toMistralMessages(body.messages);
  const toolChoice = toMistralToolChoice(body.tool_choice);
  const hasTools = Array.isArray(body.tools) && body.tools.length > 0;

  if (body.stream) {
    return streamCompletion({
      userId: caller.userId,
      projectId: extractProjectId(req),
      model,
      messages,
      tools: body.tools,
      toolChoice,
      hasTools,
    });
  }

  try {
    const res = await withRateLimitRetry(() =>
      client.chat.complete({
        model,
        messages: messages as never,
        ...(hasTools ? { tools: body.tools as never, toolChoice: (toolChoice ?? 'auto') as never } : {}),
        ...(typeof body.temperature === 'number' ? { temperature: body.temperature } : {}),
        ...(typeof body.max_tokens === 'number' ? { maxTokens: body.max_tokens } : {}),
      }),
    );

    const choice = res.choices?.[0]?.message;
    const usage: ProxyUsage = {
      promptTokens: res.usage?.promptTokens ?? null,
      completionTokens: res.usage?.completionTokens ?? null,
      totalTokens: res.usage?.totalTokens ?? null,
    };

    await meterUsage({ userId: caller.userId, projectId: extractProjectId(req), usage, model, action: 'agent_model' });

    return NextResponse.json(
      buildOpenAiCompletionResponse({
        model,
        content: typeof choice?.content === 'string' ? choice.content : '',
        toolCalls: choice?.toolCalls ?? null,
        usage,
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[agent/v1/chat/completions] failed:', msg);
    return NextResponse.json(openAiError(`model call failed: ${msg}`, 'api_error'), { status: 502 });
  }
}

/** project_id steckt im Bearer-Token (siehe resolveOpenAiCaller) — hier fürs Credit-Logging erneut extrahiert. */
function extractProjectId(req: NextRequest): string {
  const auth = req.headers.get('authorization') ?? '';
  const apiKey = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const splitAt = apiKey.lastIndexOf('.');
  return splitAt > 0 ? apiKey.slice(splitAt + 1) : '';
}

type StreamArgs = {
  userId: string;
  projectId: string;
  model: string;
  messages: ReturnType<typeof toMistralMessages>;
  tools: unknown[] | undefined;
  toolChoice: string | undefined;
  hasTools: boolean;
};

/**
 * SSE-Streaming im OpenAI-chat.completion.chunk-Format. LangChains ChatOpenAI (n8n)
 * kann Streaming nutzen; Tool-Call-Deltas müssen index-basiert akkumulierbar sein
 * (genau wie OpenAI sie sendet — ein Fragment pro function.arguments-Chunk).
 */
function streamCompletion(args: StreamArgs): Response {
  const encoder = new TextEncoder();
  const id = newCompletionId();
  const created = Math.floor(Date.now() / 1000);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      const client = getMistralClient();
      if (!client) {
        send(openAiError('MISTRAL_API_KEY not configured', 'api_error'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
        return;
      }

      try {
        const result = await withRateLimitRetry(() =>
          client.chat.stream({
            model: args.model,
            messages: args.messages as never,
            ...(args.hasTools
              ? { tools: args.tools as never, toolChoice: (args.toolChoice ?? 'auto') as never }
              : {}),
          }),
        );

        // Erster Chunk trägt die role (OpenAI-Konvention).
        send({
          id, object: 'chat.completion.chunk', created, model: args.model,
          choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
        });

        const usage: ProxyUsage = { promptTokens: null, completionTokens: null, totalTokens: null };
        let sawToolCalls = false;
        let mistralFinishReason: string | null = null;

        for await (const chunk of result) {
          const u = chunk.data.usage;
          if (u) {
            usage.promptTokens = u.promptTokens ?? usage.promptTokens;
            usage.completionTokens = u.completionTokens ?? usage.completionTokens;
            usage.totalTokens = u.totalTokens ?? usage.totalTokens;
          }
          const choice = chunk.data.choices?.[0];
          if (!choice) continue;
          if (choice.finishReason) mistralFinishReason = choice.finishReason;

          const content = choice.delta?.content;
          if (typeof content === 'string' && content) {
            send({
              id, object: 'chat.completion.chunk', created, model: args.model,
              choices: [{ index: 0, delta: { content }, finish_reason: null }],
            });
          }

          const toolCalls = choice.delta?.toolCalls;
          if (toolCalls?.length) {
            sawToolCalls = true;
            const deltas: OpenAiToolCallDelta[] = [];
            for (const tc of toolCalls as Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>) {
              const idx = tc.index ?? 0;
              deltas.push({
                index: idx,
                id: tc.id || '',
                type: 'function',
                function: {
                  name: tc.function?.name ?? '',
                  arguments: tc.function?.arguments ?? '',
                },
              } as OpenAiToolCallDelta & { index: number });
            }
            send({
              id, object: 'chat.completion.chunk', created, model: args.model,
              choices: [{ index: 0, delta: { tool_calls: deltas }, finish_reason: null }],
            });
          }
        }

        send({
          id, object: 'chat.completion.chunk', created, model: args.model,
          choices: [{ index: 0, delta: {}, finish_reason: mistralFinishReasonToOpenAi(sawToolCalls, mistralFinishReason) }],
          usage: usageToOpenAi(usage),
        });

        await meterUsage({ userId: args.userId, projectId: args.projectId, usage, model: args.model, action: 'agent_model' });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[agent/v1/chat/completions] stream failed:', msg);
        send(openAiError(`model call failed: ${msg}`, 'api_error'));
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
