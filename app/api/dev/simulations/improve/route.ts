import { NextRequest, NextResponse } from 'next/server';
import { aggregateImprovements, verifyImprovement } from '@/lib/simulation/improve';
import { listImprovements } from '@/lib/simulation/store';

function devGuard(): NextResponse | null {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_SIM_DEV !== 'true') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return null;
}

export async function GET() {
  const blocked = devGuard();
  if (blocked) return blocked;
  try {
    return NextResponse.json({ improvements: await listImprovements() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const blocked = devGuard();
  if (blocked) return blocked;
  let body: {
    action?: string;
    limit?: number;
    improvementId?: string;
    ruleId?: string;
    baselineRunId?: string;
    newRunId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  try {
    if (body.action === 'verify') {
      if (!body.improvementId || !body.ruleId || !body.baselineRunId || !body.newRunId) {
        return NextResponse.json(
          { error: 'verify needs improvementId, ruleId, baselineRunId, newRunId' },
          { status: 400 },
        );
      }
      const res = await verifyImprovement({
        improvementId: body.improvementId,
        ruleId: body.ruleId,
        baselineRunId: body.baselineRunId,
        newRunId: body.newRunId,
      });
      return NextResponse.json({ ok: true, ...res });
    }
    // default: aggregate
    const res = await aggregateImprovements(body.limit ?? 20);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
