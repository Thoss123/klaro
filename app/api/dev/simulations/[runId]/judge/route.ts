import { NextRequest, NextResponse } from 'next/server';
import { recordJudgment } from '@/lib/simulation/run';
import type { RubricVerdictInput } from '@/lib/simulation/types';
import { devSimGuard } from '@/lib/simulation/dev-guard';

/**
 * Claude Code posts its rubric verdicts here after reading the JudgePacket.
 * Body: { findings: RubricVerdictInput[] }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ runId: string }> }) {
  const blocked = await devSimGuard();
  if (blocked) return blocked;
  const { runId } = await ctx.params;

  let body: { findings?: RubricVerdictInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!Array.isArray(body.findings)) {
    return NextResponse.json({ error: 'body.findings must be an array' }, { status: 400 });
  }

  try {
    const result = await recordJudgment(runId, body.findings);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
