import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const VOXTRAL_MODEL = 'voxtral-mini-latest';
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
    }

    const apiKey = process.env.MISTRAL_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'Spracherkennung nicht konfiguriert' }, { status: 503 });
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Audiodatei fehlt' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'Aufnahme ist leer' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Aufnahme zu lang (max. 10 MB)' }, { status: 400 });
    }

    const mistralForm = new FormData();
    mistralForm.append('model', VOXTRAL_MODEL);
    mistralForm.append('language', 'de');
    mistralForm.append(
      'file',
      new Blob([await file.arrayBuffer()], { type: file.type || 'audio/webm' }),
      file.name || 'recording.webm',
    );

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

    return NextResponse.json({ text, language: data.language ?? 'de' });
  } catch (e: unknown) {
    console.error('[transcribe]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Transkription fehlgeschlagen' },
      { status: 500 },
    );
  }
}
