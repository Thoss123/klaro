import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const BUCKET = 'chat-uploads';
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    const sessionId = form.get('sessionId');

    if (!(file instanceof File) || !sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'file and sessionId required' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Datei zu groß (max. 8 MB)' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const isImage = file.type.startsWith('image/');
    const isText =
      file.type.startsWith('text/') ||
      /\.(md|txt|csv|json)$/i.test(file.name);

    let textExtract: string | undefined;
    if (isText) {
      textExtract = buf.toString('utf-8').slice(0, 12000);
    }

    const path = `${auth.user.id}/${sessionId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

    if (uploadError) {
      if (isImage && file.size < 4_000_000) {
        return NextResponse.json({
          name: file.name,
          mimeType: file.type,
          type: 'image',
          base64: buf.toString('base64'),
          textExtract,
          storageFallback: true,
        });
      }
      return NextResponse.json(
        {
          error: uploadError.message,
          hint: 'Supabase Storage Bucket "chat-uploads" anlegen (public read) oder kleineres Bild nutzen.',
        },
        { status: 500 }
      );
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({
      name: file.name,
      mimeType: file.type,
      type: isImage ? 'image' : 'document',
      url: pub.publicUrl,
      path,
      base64: isImage ? buf.toString('base64') : undefined,
      textExtract,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'upload failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
