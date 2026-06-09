import { NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import { createSupabaseServiceClient } from '@/lib/supabase';
import { logSync } from '@/lib/sync-decision';

export async function POST(req: Request) {
  try {
    const { sessionId, currentMemory, newMessage } = await req.json();

    if (!sessionId || !newMessage) {
      logSync('memory', 'skip', 'missing sessionId or newMessage');
      return NextResponse.json(
        { status: 'skipped', reason: 'missing_params' },
        { status: 400 }
      );
    }

    if (!process.env.MISTRAL_API_KEY) {
      logSync('memory', 'skip', 'MISTRAL_API_KEY missing');
      return NextResponse.json({ status: 'skipped', reason: 'no_api_key', memory: currentMemory || '' });
    }

    const supabase = createSupabaseServiceClient()

    logSync('memory', 'invoke', `session=${sessionId}`, {
      currentChars: (currentMemory || '').length,
      newMessageChars: (newMessage || '').length,
    });

    const mistralClient = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
    
    // We use mistral-small-latest because it is fast, cheap, and perfect for extraction tasks.
    const response = await mistralClient.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        {
          role: 'user',
          content: `Bestehende Memory:
${currentMemory || '[CORE FACTS]\nKeine.\n\n[LATEST CONTEXT]\nKeine.'}

Neue Information aus dem Gespräch:
${newMessage}

Deine Aufgabe ist es, das Gedächtnis des Coaches (Memory) zu aktualisieren und in genau zwei Sektionen zu gliedern:

[CORE FACTS]
Hierhin gehören beständige Fakten über das Unternehmen (Zielgruppe, Angebot, Prozesse, Hürden). Diese ändern sich selten. Extrahiere neue beständige Fakten und füge sie hier hinzu. Streiche alte, die sich als falsch erwiesen haben.

[LATEST CONTEXT]
Hierhin gehört der aktuellste Kontext der letzten Gesprächsrunden (z.B. "Nutzer schaut sich gerade Tool X an", "Nutzer möchte Prozess Y zuerst bauen"). Halte diese Sektion SEHR kurz (max 3 Bullet Points). Älterer Kontext fliegt hier raus.

Gib NUR die aktualisierte Memory zurück, exakt in diesem Format:
[CORE FACTS]
- ...
[LATEST CONTEXT]
- ...

Nichts erfinden! Wenn es nichts Neues gibt, gib einfach die bestehende Memory zurück, aber stelle sicher, dass sie in [CORE FACTS] und [LATEST CONTEXT] gegliedert ist.`
        }
      ]
    });

    // Mistral content is `string | ContentChunk[]` — flatten to plain text.
    const rawContent = response.choices?.[0]?.message?.content;
    const contentStr = typeof rawContent === 'string'
      ? rawContent
      : Array.isArray(rawContent)
        ? rawContent.map(c => (c.type === 'text' ? c.text : '')).join('')
        : '';
    const newMemory = contentStr.trim() || currentMemory || '';
    const normalizedCurrent = (currentMemory || '').trim();

    if (!newMemory || newMemory === normalizedCurrent) {
      logSync('memory', 'skip', 'no new facts', { sessionId, reason: 'no_new_facts' });
      return NextResponse.json({
        status: 'unchanged',
        reason: 'no_new_facts',
        memory: normalizedCurrent || newMemory,
      });
    }

    const { error: updateError } = await supabase
      .from('sessions')
      .update({ memory: newMemory })
      .eq('id', sessionId);

    if (updateError) {
      logSync('memory', 'fail', 'DB update failed', { sessionId, error: updateError.message });
      return NextResponse.json(
        { status: 'error', reason: 'db_save_failed', error: updateError.message, memory: normalizedCurrent },
        { status: 500 }
      );
    }

    logSync('memory', 'success', `updated session=${sessionId}`, {
      chars: newMemory.length,
      delta: newMemory.length - normalizedCurrent.length,
    });
    return NextResponse.json({ status: 'updated', reason: 'new_facts_merged', memory: newMemory });
  } catch (error: any) {
    logSync('memory', 'fail', error.message);
    return NextResponse.json(
      { status: 'error', reason: 'exception', error: error.message },
      { status: 500 }
    );
  }
}
