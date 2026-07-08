import { NextRequest, NextResponse } from 'next/server';
import { importRunToSession } from '@/lib/simulation/import-session';
import { devSimGuard } from '@/lib/simulation/dev-guard';

/**
 * Import a finished run into a real chat session for a (test) user, so it can be
 * opened and continued in the normal chat UI.
 * Body: { userId?: string } — defaults to SIM_TEST_USER_ID from the env.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ runId: string }> }) {
  const blocked = await devSimGuard();
  if (blocked) return blocked;
  const { runId } = await ctx.params;

  let body: { userId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — fall back to the env test user
  }

  const userId = body.userId || process.env.SIM_TEST_USER_ID;
  if (!userId) {
    return NextResponse.json(
      { error: 'no userId given and SIM_TEST_USER_ID is not set' },
      { status: 400 },
    );
  }

  try {
    const result = await importRunToSession(runId, userId, req.nextUrl.origin);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
