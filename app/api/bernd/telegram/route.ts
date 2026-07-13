import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase';
import { resolveProjectByChatId, verifyPairing } from '@/lib/bernd/channel';
import { tgDownloadBase64, tgSendChatAction, tgSendMessage } from '@/lib/bernd/telegram';
import { getBerndConfig } from '@/lib/bernd/config';
import { dispatchDirectives } from '@/lib/bernd/telegram-dispatch';
import type { RouterDirective } from '@/lib/bernd/types';

export const maxDuration = 90;

interface TelegramPhotoSize {
  file_id: string;
  width: number;
  height: number;
}

interface TelegramUpdate {
  message?: {
    chat: { id: number | string };
    text?: string;
    caption?: string;
    voice?: { file_id: string };
    photo?: TelegramPhotoSize[];
  };
}

/**
 * Webhook-Ziel des geteilten Telegram-Bots (Architekturplan §2). Verbindet den Bot
 * END-TO-END mit dem bestehenden Router — OHNE n8n: Multimodal-Verarbeitung (Voice-
 * Transkription, Foto-OCR) läuft bewusst hier in der App über /api/bernd/media, danach
 * geht der normalisierte Text an /api/bernd/router.
 *
 * WICHTIG: Telegram erwartet auf Webhook-Calls praktisch immer 200 — sonst retryt es
 * aggressiv. Interne Fehler werden daher nur geloggt, nie als Fehlerstatus zurückgegeben
 * (Ausnahme: ungültiges Secret → 401, das ist kein Telegram-Retry-Fall sondern Spoofing-Schutz).
 *
 * POST /api/bernd/telegram  (Telegram Update-Objekt)
 */
export async function POST(req: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
  const incomingSecret = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!expectedSecret || incomingSecret !== expectedSecret) {
    return NextResponse.json({ error: 'invalid secret' }, { status: 401 });
  }

  try {
    await handleUpdate(req);
  } catch (e: unknown) {
    console.error('[bernd/telegram] handleUpdate failed:', e instanceof Error ? e.message : String(e));
  }

  // Immer 200 — Telegram soll nicht retryn, Fehler wurden bereits geloggt.
  return NextResponse.json({ ok: true });
}

async function handleUpdate(req: NextRequest): Promise<void> {
  const update = (await req.json().catch(() => ({}))) as TelegramUpdate;
  const message = update.message;
  if (!message) return; // andere Update-Typen (edited_message, callback_query, ...) ignorieren

  const chatId = String(message.chat.id);
  const supabase = createSupabaseServiceClient();
  const origin = req.nextUrl.origin;
  const workspaceToken = process.env.WORKSPACE_API_TOKEN?.trim() ?? '';

  // ── /start-Pairing ──────────────────────────────────────────────────────────────────
  const rawText = message.text?.trim() ?? '';
  if (rawText.startsWith('/start')) {
    const pairingCode = rawText.slice('/start'.length).trim();
    if (pairingCode) {
      const result = await verifyPairing(supabase, { chatId, pairingCode });
      const reply = result.ok
        ? '✅ Verbunden! Ab jetzt kannst du mir hier schreiben, Sprachnachrichten schicken oder Fotos senden.'
        : `Konnte nicht koppeln: ${result.reason ?? 'unbekannter Fehler'}`;
      await tgSendMessage(chatId, reply);
    } else {
      await tgSendMessage(chatId, 'Bitte tippe den Pairing-Link aus deinem Bernd-Dashboard an (t.me/<bot>?start=<code>).');
    }
    return;
  }

  // ── Projekt auflösen ────────────────────────────────────────────────────────────────
  const projectId = await resolveProjectByChatId(supabase, chatId);
  if (!projectId) {
    await tgSendMessage(chatId, 'Bitte koppel mich zuerst über dein Bernd-Dashboard (Link tippen).');
    return;
  }

  await tgSendChatAction(chatId, 'typing');

  // ── Medien → normalisierten Text auflösen ──────────────────────────────────────────
  let text = '';
  let mediaKind: 'text' | 'voice' | 'photo' = 'text';

  if (message.voice?.file_id) {
    mediaKind = 'voice';
    const file = await tgDownloadBase64(message.voice.file_id);
    if (file) {
      text = await resolveMediaText(origin, workspaceToken, {
        project_id: projectId,
        kind: 'voice',
        file_base64: file.base64,
        mime: file.mime,
      });
    }
  } else if (message.photo?.length) {
    mediaKind = 'photo';
    // Telegram liefert Fotos aufsteigend sortiert nach Größe — letztes Element = größte Auflösung.
    const largest = message.photo[message.photo.length - 1];
    const file = await tgDownloadBase64(largest.file_id);
    if (file) {
      const ocrText = await resolveMediaText(origin, workspaceToken, {
        project_id: projectId,
        kind: 'photo',
        file_base64: file.base64,
        mime: file.mime,
      });
      text = message.caption?.trim() ? `${ocrText}\n\n${message.caption.trim()}` : ocrText;
    }
  } else {
    text = rawText || message.text?.trim() || '';
  }

  if (!text.trim()) {
    await tgSendMessage(
      chatId,
      'Hmm, das konnte ich nicht verarbeiten — magst du es nochmal senden oder kurz als Text schreiben?',
    );
    return;
  }

  // ── Router aufrufen ─────────────────────────────────────────────────────────────────
  try {
    const res = await fetch(`${origin}/api/bernd/router`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workspaceToken}`,
      },
      body: JSON.stringify({ chat_id: chatId, text, media_kind: mediaKind, project_id: projectId }),
    });
    const data = (await res.json().catch(() => ({}))) as { text?: string; directives?: RouterDirective[] };
    const replyText = typeof data?.text === 'string' && data.text.trim() ? data.text : null;
    if (replyText) {
      await tgSendMessage(chatId, replyText);
    } else {
      console.error('[bernd/telegram] Router lieferte keinen Text:', res.status, data);
      await tgSendMessage(chatId, 'Da ist gerade etwas schiefgelaufen — magst du es nochmal versuchen?');
    }

    // ── Directives ausführen, die der Router zurückgibt (z.B. trigger_flow nach HITL-Freigabe) ──
    if (Array.isArray(data.directives) && data.directives.length) {
      const config = await getBerndConfig(supabase, projectId);
      const hints = await dispatchDirectives({ directives: data.directives, config, chatId, projectId });
      if (hints.length) {
        await tgSendMessage(chatId, hints.join('\n'));
      }
    }
  } catch (e: unknown) {
    console.error('[bernd/telegram] Router-Call failed:', e instanceof Error ? e.message : String(e));
    await tgSendMessage(chatId, 'Da ist gerade etwas schiefgelaufen — magst du es nochmal versuchen?');
  }
}

/** /api/bernd/media aufrufen und den erkannten Text zurückgeben ('' bei Fehler). */
async function resolveMediaText(
  origin: string,
  workspaceToken: string,
  body: { project_id: string; kind: 'voice' | 'photo'; file_base64: string; mime: string },
): Promise<string> {
  try {
    const res = await fetch(`${origin}/api/bernd/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workspaceToken}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data?.text !== 'string') {
      console.error('[bernd/telegram] media-Verarbeitung fehlgeschlagen:', res.status, data);
      return '';
    }
    return data.text as string;
  } catch (e: unknown) {
    console.error('[bernd/telegram] resolveMediaText failed:', e instanceof Error ? e.message : String(e));
    return '';
  }
}
