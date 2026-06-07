import { NextRequest, NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { mistralCompleteJson } from '@/lib/agents/llm';
import { runNodeResolver, applyResolverToSteps } from '@/lib/agents/node-resolver';
import type { WorkflowStep } from '@/lib/types';

/** POST /api/n8n/resolve — map abstract steps → n8n node types. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    steps: WorkflowStep[];
    context?: {
      useCaseTitle?: string;
      painPoint?: string;
      tools?: string[];
      chatSnippet?: string;
    };
    apply?: boolean;
    overwrite?: boolean;
    /** Nur Heuristik — kein Mistral (Deploy-Karten, Rate-Limit-Schutz). */
    heuristicOnly?: boolean;
  };

  if (!body.steps?.length) {
    return NextResponse.json({ error: 'steps required' }, { status: 400 });
  }

  let complete;
  if (!body.heuristicOnly && process.env.MISTRAL_API_KEY) {
    const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
    complete = mistralCompleteJson(client);
  }

  try {
    const { results, source } = await runNodeResolver(
      { steps: body.steps, context: body.context },
      complete,
    );

    const response: Record<string, unknown> = { results, source };
    if (body.apply) {
      response.steps = applyResolverToSteps(body.steps, results, { overwrite: body.overwrite });
    }

    return NextResponse.json(response);
  } catch (e) {
    console.error('[n8n/resolve]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Resolve fehlgeschlagen' },
      { status: 500 },
    );
  }
}
