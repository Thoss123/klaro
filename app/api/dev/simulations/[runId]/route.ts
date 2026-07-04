import { NextRequest, NextResponse } from 'next/server';
import { getRun, getTranscript, getFindings } from '@/lib/simulation/store';

function devGuard(): NextResponse | null {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_SIM_DEV !== 'true') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ runId: string }> }) {
  const blocked = devGuard();
  if (blocked) return blocked;
  const { runId } = await ctx.params;
  try {
    const run = await getRun(runId);
    if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 });
    const [transcript, findings] = await Promise.all([getTranscript(runId), getFindings(runId)]);
    return NextResponse.json({ run, transcript, findings });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
