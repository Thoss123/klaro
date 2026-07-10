import { NextRequest, NextResponse } from 'next/server';
import { resolveCaller } from '@/lib/machine-auth';
import { canAfford, debitFromUsage } from '@/lib/billing/credits';
import { extractTextFromImage } from '@/lib/image-ocr';

export const maxDuration = 90;

const VOXTRAL_MODEL = 'voxtral-mini-latest';
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Multimodale Vorverarbeitung für den Telegram-Router: n8n hat die Datei bereits über
 * `getFile` geladen und schickt sie Base64-kodiert hierher (kein Modell-Key in n8n).
 * voice → Voxtral-Transkription (Logik aus app/api/transcribe/route.ts, aber machine-auth
 * statt Cookie-Session — Credit-Abbuchung läuft auf den Projekt-Owner, nicht den Aufrufer).
 * photo → Mistral-OCR (lib/image-ocr.ts).
 *
 * POST /api/bernd/media  { project_id, kind: 'voice'|'photo', file_base64, mime? }
 *   → { text, kind }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { project_id, kind, file_base64, mime } = body as {
    project_id?: string;
    kind?: string;
    file_base64?: string;
    mime?: string;
  };

  const caller = await resolveCaller(req, project_id ?? null);
  if ('error' in caller) return NextResponse.json({ error: caller.error }, { status: caller.status });

  if (!project_id || (kind !== 'voice' && kind !== 'photo') || !file_base64?.trim()) {
    return NextResponse.json(
      { error: 'project_id, kind (voice|photo), file_base64 required' },
      { status: 400 },
    );
  }

  const affordability = await canAfford(caller.userId, 1);
  if (!affordability.ok) {
    return NextResponse.json(
      { error: 'INSUFFICIENT_CREDITS', message: 'Credit-Guthaben aufgebraucht.' },
      { status: 402 },
    );
  }

  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: 'MISTRAL_API_KEY not configured' }, { status: 500 });

  let buffer: Buffer;
  try {
    buffer = Buffer.from(file_base64, 'base64');
  } catch {
    return NextResponse.json({ error: 'file_base64 ist kein gültiges Base64' }, { status: 400 });
  }
  if (buffer.length === 0) {
    return NextResponse.json({ error: 'Datei ist leer' }, { status: 400 });
  }
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Datei zu groß (max. 10 MB)' }, { status: 400 });
  }

  try {
    if (kind === 'voice') {
      const mistralForm = new FormData();
      mistralForm.append('model', VOXTRAL_MODEL);
      mistralForm.append('language', 'de');
      mistralForm.append('file', new Blob([new Uint8Array(buffer)], { type: mime || 'audio/ogg' }), 'voice.ogg');

      const mistralRes = await fetch('https://api.mistral.ai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: mistralForm,
      });
      const data = await mistralRes.json().catch(() => ({}));
      if (!mistralRes.ok) {
        const detail =
          typeof data?.message === 'string'
            ? data.message
            : typeof data?.error === 'string'
              ? data.error
              : 'Transkription fehlgeschlagen';
        return NextResponse.json({ error: detail }, { status: mistralRes.status >= 500 ? 502 : 400 });
      }
      const text = typeof data?.text === 'string' ? data.text.trim() : '';
      if (!text) {
        return NextResponse.json({ error: 'Keine Sprache erkannt — bitte erneut versuchen' }, { status: 422 });
      }

      await debitFromUsage({
        userId: caller.userId,
        usage: { totalTokens: Math.max(1, Math.ceil(buffer.length / 1024)) },
        model: VOXTRAL_MODEL,
        action: 'bernd_transcribe',
        projectId: project_id,
        metadata: { fileSize: buffer.length, language: data.language ?? 'de' },
      }).catch((e) =>
        console.warn('[bernd/media] transcribe debit failed:', e instanceof Error ? e.message : String(e)),
      );

      return NextResponse.json({ text, kind: 'voice' });
    }

    // kind === 'photo'
    const text = await extractTextFromImage(buffer.toString('base64'), mime || 'image/jpeg', apiKey);
    if (!text) {
      return NextResponse.json({ error: 'Kein Text im Bild erkannt' }, { status: 422 });
    }

    await debitFromUsage({
      userId: caller.userId,
      usage: { totalTokens: Math.max(1, Math.ceil(buffer.length / 1024)) },
      model: 'mistral-ocr-latest',
      action: 'bernd_ocr',
      projectId: project_id,
      metadata: { fileSize: buffer.length },
    }).catch((e) =>
      console.warn('[bernd/media] ocr debit failed:', e instanceof Error ? e.message : String(e)),
    );

    return NextResponse.json({ text, kind: 'photo' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[bernd/media] failed:', msg);
    return NextResponse.json({ error: `media processing failed: ${msg}` }, { status: 500 });
  }
}
