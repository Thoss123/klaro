import { NextRequest, NextResponse } from 'next/server';
import { simulateRun, type SimProgressEvent } from '@/lib/simulation/run';
import { listRuns, listPersonas, seedPersonas, getRun } from '@/lib/simulation/store';
import { devSimGuard } from '@/lib/simulation/dev-guard';
import { PHASE_ORDER } from '@/lib/simulation/types';
import type { Phase } from '@/lib/types';

// Long runs: a full 4-phase simulation can take a few minutes.
export const maxDuration = 300;

export async function GET() {
  const blocked = await devSimGuard();
  if (blocked) return blocked;
  try {
    const [runs, personas] = await Promise.all([listRuns(50), listPersonas()]);
    return NextResponse.json({ runs, personas });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const blocked = await devSimGuard();
  if (blocked) return blocked;
  let body: {
    action?: string;
    persona?: string;
    label?: string;
    phases?: string[];
    resume?: { runId: string; afterPhase: string };
    maxTurnsPerPhase?: number;
    stream?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  try {
    if (body.action === 'seed') {
      const count = await seedPersonas();
      return NextResponse.json({ ok: true, seeded: count });
    }

    // Beim Resume darf der Persona-Slug fehlen — er wird aus dem Ursprungslauf
    // abgeleitet (so wie es die CLI-Doku „--resume <runId> --after <phase>" meint).
    let personaSlug = body.persona;
    if (!personaSlug && body.resume?.runId) {
      const original = await getRun(body.resume.runId);
      personaSlug = original?.persona_slug;
    }
    if (!personaSlug) {
      return NextResponse.json({ error: 'missing "persona" slug' }, { status: 400 });
    }

    const phases = (body.phases ?? []).filter((p): p is Phase =>
      (PHASE_ORDER as string[]).includes(p),
    );
    const resume = body.resume
      ? { runId: body.resume.runId, afterPhase: body.resume.afterPhase as Phase }
      : undefined;

    const input = {
      personaSlug,
      label: body.label,
      phases: phases.length ? phases : undefined,
      resume,
      baseUrl: req.nextUrl.origin,
      maxTurnsPerPhase: body.maxTurnsPerPhase,
    };

    // Streaming mode (NDJSON): flush headers immediately and emit one line per
    // progress event, so the client's fetch never hits the headers/body timeout
    // during the (multi-minute) run. Each line is a SimProgressEvent; the final
    // line is { kind:'packet', packet } or { kind:'error', error, runId? }.
    if (body.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          let lastRunId: string | undefined;
          const write = (obj: unknown) =>
            controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
          try {
            const packet = await simulateRun(input, (evt: SimProgressEvent) => {
              if (evt.kind === 'run') lastRunId = evt.runId;
              write(evt);
            });
            write({ kind: 'packet', packet });
          } catch (e) {
            write({ kind: 'error', error: e instanceof Error ? e.message : String(e), runId: lastRunId });
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    // Step 1 only: Mistral simulates + mechanical judging. The returned packet
    // is judged by Claude Code, which then POSTs to /[runId]/judge.
    const packet = await simulateRun(input);
    return NextResponse.json({ ok: true, packet });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
