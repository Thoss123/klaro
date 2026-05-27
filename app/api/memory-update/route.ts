import { NextResponse } from 'next/server';
import { Mistral } from '@mistralai/mistralai';
import { createClient } from '@supabase/supabase-js';
import { logSync } from '@/lib/sync-decision';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

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
${currentMemory || 'Noch keine.'}

Neue Information aus dem Gespräch:
${newMessage}

Extrahiere NUR neue, relevante Fakten über das Unternehmen oder das Projekt.
Format: kurze Bullet Points, maximal 3 neue Punkte.
Komprimiere die gesamte Memory (alt + neu) auf maximal 500 Wörter, sodass die wichtigsten Kernfakten erhalten bleiben. Ältere, irrelevante Infos können wegfallen.
Nichts erfinden, nur was explizit gesagt wurde.
Wenn es absolut NICHTS Neues gibt und die bestehende Memory aktuell ist, antworte exakt mit dem Text der bestehenden Memory.`
        }
      ]
    });

    const newMemory = (response.choices?.[0]?.message?.content || '').trim() || currentMemory || '';
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
