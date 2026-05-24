import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { ziel, ki_erfahrung, wer_setzt_um, hindernis, tempo } = data;

    const { data: session, error } = await supabase
      .from('sessions')
      .insert([
        { ziel, ki_erfahrung, wer_setzt_um, hindernis, tempo }
      ])
      .select('id')
      .single();

    if (error) {
      console.error("Supabase Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: session.id });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
