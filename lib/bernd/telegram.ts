/**
 * Telegram-Bot-API-Helfer für den geteilten Bernd-Bot (Architekturplan §2). Alle Funktionen
 * nutzen `TELEGRAM_BOT_TOKEN` und sind server-only — nie im Client importieren.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org';

function botToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
}

function apiUrl(method: string): string {
  return `${TELEGRAM_API_BASE}/bot${botToken()}/${method}`;
}

function fileUrl(filePath: string): string {
  return `${TELEGRAM_API_BASE}/file/bot${botToken()}/${filePath}`;
}

/** Text-Nachricht an einen Chat senden. Best-effort — Fehler werden nur geloggt. */
export async function tgSendMessage(chatId: string | number, text: string): Promise<void> {
  try {
    if (!botToken()) {
      console.error('[bernd/telegram] TELEGRAM_BOT_TOKEN nicht gesetzt');
      return;
    }
    const res = await fetch(apiUrl('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('[bernd/telegram] sendMessage fehlgeschlagen:', res.status, data);
    }
  } catch (e: unknown) {
    console.error('[bernd/telegram] sendMessage failed:', e instanceof Error ? e.message : String(e));
  }
}

/** Chat-Action (z.B. "typing") senden — rein kosmetisch, Fehler werden verschluckt. */
export async function tgSendChatAction(chatId: string | number, action = 'typing'): Promise<void> {
  try {
    if (!botToken()) return;
    await fetch(apiUrl('sendChatAction'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  } catch {
    // best-effort, bewusst ignoriert
  }
}

/** Datei-Metadaten (inkl. `file_path`) für einen `file_id` abrufen. */
export async function tgGetFile(fileId: string): Promise<{ file_path: string } | null> {
  try {
    if (!botToken()) {
      console.error('[bernd/telegram] TELEGRAM_BOT_TOKEN nicht gesetzt');
      return null;
    }
    const res = await fetch(apiUrl('getFile'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.result?.file_path) {
      console.error('[bernd/telegram] getFile fehlgeschlagen:', res.status, data);
      return null;
    }
    return { file_path: data.result.file_path as string };
  } catch (e: unknown) {
    console.error('[bernd/telegram] getFile failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Dateiendung → MIME-Typ (deckt die von Telegram üblicherweise gelieferten Formate ab). */
function mimeFromExtension(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'oga':
    case 'ogg':
      return 'audio/ogg';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

/** Datei über `getFile` auflösen, laden und als Base64 zurückgeben (samt abgeleitetem MIME-Typ). */
export async function tgDownloadBase64(fileId: string): Promise<{ base64: string; mime: string } | null> {
  try {
    const file = await tgGetFile(fileId);
    if (!file) return null;

    const res = await fetch(fileUrl(file.file_path));
    if (!res.ok) {
      console.error('[bernd/telegram] Datei-Download fehlgeschlagen:', res.status);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return { base64: buffer.toString('base64'), mime: mimeFromExtension(file.file_path) };
  } catch (e: unknown) {
    console.error('[bernd/telegram] tgDownloadBase64 failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Webhook für den Bot registrieren (inkl. Secret-Token gegen Spoofing). */
export async function tgSetWebhook(url: string, secret: string): Promise<{ ok: boolean; description?: string }> {
  try {
    if (!botToken()) {
      return { ok: false, description: 'TELEGRAM_BOT_TOKEN nicht gesetzt' };
    }
    const res = await fetch(apiUrl('setWebhook'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, secret_token: secret }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: Boolean(data?.ok), description: data?.description as string | undefined };
  } catch (e: unknown) {
    return { ok: false, description: e instanceof Error ? e.message : String(e) };
  }
}

/** Webhook löschen (optional, z.B. für lokales Long-Polling-Testing). */
export async function tgDeleteWebhook(): Promise<void> {
  try {
    if (!botToken()) return;
    await fetch(apiUrl('deleteWebhook'), { method: 'POST' });
  } catch (e: unknown) {
    console.error('[bernd/telegram] deleteWebhook failed:', e instanceof Error ? e.message : String(e));
  }
}
