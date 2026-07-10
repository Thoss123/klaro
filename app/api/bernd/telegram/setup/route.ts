import { NextRequest, NextResponse } from 'next/server';
import { tgSetWebhook } from '@/lib/bernd/telegram';

/**
 * Einmaliger Setup-Aufruf nach dem Deploy, um den Telegram-Webhook auf diese Deployment-
 * URL zu registrieren (idempotent — mehrfaches Aufrufen ist unschädlich). Vor der Nutzung
 * per `?token=<WORKSPACE_API_TOKEN>` abgesichert, da der Endpoint sonst unauthentifiziert
 * den Bot-Webhook umbiegen könnte.
 *
 * GET /api/bernd/telegram/setup?token=<WORKSPACE_API_TOKEN>
 */
export async function GET(req: NextRequest) {
  const expectedToken = process.env.WORKSPACE_API_TOKEN?.trim();
  const providedToken = req.nextUrl.searchParams.get('token') ?? '';
  if (!expectedToken || providedToken !== expectedToken) {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  }

  const webhookUrl = `${req.nextUrl.origin}/api/bernd/telegram`;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';

  const result = await tgSetWebhook(webhookUrl, secret);

  return NextResponse.json({ ...result, webhookUrl });
}
