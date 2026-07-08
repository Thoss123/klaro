import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase';
import { sendEmail, FROM_EMAIL } from '@/lib/email';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import type { WaitlistFormData, WaitlistStatus, WaitlistUpsertBody } from '@/lib/waitlist-types';

const NOTIFY_EMAIL = process.env.WAITLIST_NOTIFY_EMAIL?.trim() || 'hello@axantilo.com';

function pickFields(data: WaitlistFormData | undefined) {
  return {
    prozesse: data?.prozesse?.trim() || null,
    unternehmensgroesse: data?.unternehmensgroesse?.trim() || null,
    tools: data?.tools?.trim() || null,
    vorname: data?.vorname?.trim() || null,
    firmenname: data?.firmenname?.trim() || null,
    email: data?.email?.trim().toLowerCase() || null,
    telefon: data?.telefon?.trim() || null,
  };
}

function hasMeaningfulData(fields: ReturnType<typeof pickFields>): boolean {
  return Boolean(
    fields.prozesse ||
      fields.unternehmensgroesse ||
      fields.tools ||
      fields.vorname ||
      fields.firmenname ||
      fields.email ||
      fields.telefon,
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rowToHtml(fields: ReturnType<typeof pickFields>, meta: {
  status: WaitlistStatus;
  step: number;
  sessionToken: string;
}) {
  const lines = [
    ['Status', meta.status],
    ['Schritt', String(meta.step)],
    ['Prozesse', fields.prozesse],
    ['Teamgröße', fields.unternehmensgroesse],
    ['Tools', fields.tools],
    ['Vorname', fields.vorname],
    ['Firma', fields.firmenname],
    ['E-Mail', fields.email],
    ['Telefon', fields.telefon],
    ['Session', meta.sessionToken],
  ].filter(([, v]) => v);

  return lines
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#64748b;vertical-align:top">${escapeHtml(label!)}</td><td style="padding:6px 0">${escapeHtml(value!)}</td></tr>`,
    )
    .join('');
}

async function notifyTeam(
  fields: ReturnType<typeof pickFields>,
  meta: { status: WaitlistStatus; step: number; sessionToken: string; previousStatus?: string },
) {
  if (!process.env.RESEND_API_KEY?.trim()) return;
  if (!hasMeaningfulData(fields)) return;

  const isComplete = meta.status === 'completed';
  const isNewAbandon =
    meta.status === 'abandoned' && meta.previousStatus !== 'abandoned' && meta.previousStatus !== 'completed';

  if (!isComplete && !isNewAbandon) return;

  const subject =
    meta.status === 'completed'
      ? `Warteliste: ${fields.vorname || fields.email || 'Neue Anmeldung'}`
      : `Warteliste (abgebrochen): Schritt ${meta.step}`;

  await sendEmail({
    to: NOTIFY_EMAIL,
    subject,
    html: `
      <h2 style="font-family:sans-serif;color:#0f172a">${escapeHtml(subject)}</h2>
      <table style="font-family:sans-serif;font-size:14px;color:#0f172a">${rowToHtml(fields, meta)}</table>
    `,
  });
}

async function notifyUser(fields: ReturnType<typeof pickFields>) {
  if (!process.env.RESEND_API_KEY?.trim() || !fields.email) return;

  const name = fields.vorname ? escapeHtml(fields.vorname) : 'du';

  await sendEmail({
    to: fields.email,
    from: FROM_EMAIL,
    subject: 'Du bist auf der Axantilo-Warteliste',
    html: `
      <p style="font-family:sans-serif;font-size:16px;color:#0f172a">Hallo ${name},</p>
      <p style="font-family:sans-serif;font-size:16px;color:#334155;line-height:1.6">
        danke für deine Anmeldung zur Axantilo-Testphase. Wir melden uns, sobald ein Testplatz frei wird —
        in der Regel innerhalb von 24 Stunden.
      </p>
      <p style="font-family:sans-serif;font-size:14px;color:#64748b">
        Axantilo · Graz, Österreich
      </p>
    `,
  });
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(`waitlist:${ip}`, 5, 60_000);
    if (!rate.ok) {
      return NextResponse.json(
        { error: 'Zu viele Anfragen. Bitte kurz warten.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
      );
    }

    const body = (await req.json()) as WaitlistUpsertBody;
    const sessionToken = body.sessionToken?.trim();
    if (!sessionToken || sessionToken.length < 8) {
      return NextResponse.json({ error: 'Ungültiger Session-Token.' }, { status: 400 });
    }

    const step = Math.max(1, Math.min(10, Number(body.step) || 1));
    const status: WaitlistStatus =
      body.status === 'completed' || body.status === 'abandoned' ? body.status : 'partial';
    const fields = pickFields(body.data);

    if (status === 'completed' && !fields.email) {
      return NextResponse.json({ error: 'E-Mail ist erforderlich.' }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const userAgent = req.headers.get('user-agent');

    const { data: existing } = await supabase
      .from('waitlist_signups')
      .select(
        'id, status, prozesse, unternehmensgroesse, tools, vorname, firmenname, email, telefon, step_reached, completed_at',
      )
      .eq('session_token', sessionToken)
      .maybeSingle();

    const merged = {
      prozesse: fields.prozesse ?? existing?.prozesse ?? null,
      unternehmensgroesse: fields.unternehmensgroesse ?? existing?.unternehmensgroesse ?? null,
      tools: fields.tools ?? existing?.tools ?? null,
      vorname: fields.vorname ?? existing?.vorname ?? null,
      firmenname: fields.firmenname ?? existing?.firmenname ?? null,
      email: fields.email ?? existing?.email ?? null,
      telefon: fields.telefon ?? existing?.telefon ?? null,
    };

    const stepReached = Math.max(step, existing?.step_reached ?? 1);
    const now = new Date().toISOString();

    const row = {
      session_token: sessionToken,
      ...merged,
      step_reached: stepReached,
      status:
        existing?.status === 'completed'
          ? 'completed'
          : status === 'completed'
            ? 'completed'
            : status === 'abandoned' && existing?.status !== 'completed'
              ? 'abandoned'
              : existing?.status === 'abandoned'
                ? 'abandoned'
                : 'partial',
      source: body.source?.trim() || 'landing',
      referrer: body.referrer?.trim() || null,
      user_agent: userAgent,
      updated_at: now,
      completed_at:
        status === 'completed' || existing?.status === 'completed' ? existing?.completed_at ?? now : null,
    };

    if (!hasMeaningfulData(merged) && !existing) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    let id = existing?.id as string | undefined;

    if (existing) {
      const { error } = await supabase.from('waitlist_signups').update(row).eq('id', existing.id);
      if (error) {
        console.error('[waitlist] update failed', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      const { data: inserted, error } = await supabase
        .from('waitlist_signups')
        .insert({ ...row, created_at: now })
        .select('id')
        .single();
      if (error) {
        console.error('[waitlist] insert failed', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      id = inserted.id;
    }

    const finalStatus = row.status as WaitlistStatus;

    try {
      await notifyTeam(merged, {
        status: finalStatus,
        step: stepReached,
        sessionToken,
        previousStatus: existing?.status,
      });
      if (finalStatus === 'completed' && existing?.status !== 'completed') {
        await notifyUser(merged);
      }
    } catch (emailErr) {
      console.error('[waitlist] email notify failed', emailErr);
    }

    return NextResponse.json({ ok: true, id, status: finalStatus });
  } catch (error) {
    console.error('[waitlist] API error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
