import { NextRequest, NextResponse } from 'next/server';
import { resolveOpenAiCaller } from '@/lib/machine-auth';
import { listAllowedModels, openAiError } from '@/lib/agents/openai-compat';

/**
 * OpenAI-kompatible Model-Liste — n8n testet eine `openAiApi`-Credential beim Speichern
 * mit GET {baseURL}/models. Ohne diesen Endpunkt zeigt n8n die Credential als „ungültig".
 */
export async function GET(req: NextRequest) {
  const caller = await resolveOpenAiCaller(req);
  if ('error' in caller) {
    const status = caller.status;
    const type = status === 401 ? 'authentication_error' : status === 404 ? 'invalid_request_error' : 'api_error';
    return NextResponse.json(openAiError(caller.error, type), { status });
  }

  const created = Math.floor(Date.now() / 1000);
  return NextResponse.json({
    object: 'list',
    data: listAllowedModels().map(id => ({
      id,
      object: 'model',
      created,
      owned_by: 'axantilo',
    })),
  });
}
