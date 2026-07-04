import { NextRequest, NextResponse } from 'next/server';
import { simulateRun } from '@/lib/simulation/run';
import { listRuns, listPersonas, seedPersonas } from '@/lib/simulation/store';
import { PHASE_ORDER } from '@/lib/simulation/types';
import type { Phase } from '@/lib/types';

/** Dev-only gate: these routes drive paid LLM calls and touch admin tables. */
function devGuard(): NextResponse | null {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_SIM_DEV !== 'true') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return null;
}

// Long runs: a full 4-phase simulation can take a few minutes.
export const maxDuration = 300;

export async function GET() {
  const blocked = devGuard();
  if (blocked) return blocked;
  try {
    const [runs, personas] = await Promise.all([listRuns(50), listPersonas()]);
    return NextResponse.json({ runs, personas });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const blocked = devGuard();
  if (blocked) return blocked;
  let body: {
    action?: string;
    persona?: string;
    label?: string;
    phases?: string[];
    resume?: { runId: string; afterPhase: string };
    maxTurnsPerPhase?: number;
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

    if (!body.persona) {
      return NextResponse.json({ error: 'missing "persona" slug' }, { status: 400 });
    }

    const phases = (body.phases ?? []).filter((p): p is Phase =>
      (PHASE_ORDER as string[]).includes(p),
    );
    const resume = body.resume
      ? { runId: body.resume.runId, afterPhase: body.resume.afterPhase as Phase }
      : undefined;

    // Step 1 only: Mistral simulates + mechanical judging. The returned packet
    // is judged by Claude Code, which then POSTs to /[runId]/judge.
    const packet = await simulateRun({
      personaSlug: body.persona,
      label: body.label,
      phases: phases.length ? phases : undefined,
      resume,
      baseUrl: req.nextUrl.origin,
      maxTurnsPerPhase: body.maxTurnsPerPhase,
    });
    return NextResponse.json({ ok: true, packet });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
