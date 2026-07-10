import type { SupabaseClient } from '@supabase/supabase-js';
import type { BerndMessage } from '@/lib/bernd/types';

/**
 * Mandanten-Routing + Konversations-Memory für den geteilten Telegram-Bot
 * (Architekturplan §2/§4). `bernd_channel_links` bildet `chat_id → project_id` ab
 * (ein geteilter Bot bedient alle Betriebe); `bernd_messages` ist der dauerhafte
 * Router-Konversations-State/Audit, getrennt vom Coach-`messages`.
 *
 * Alle Helper nehmen den Supabase-Client als Parameter (DI-Muster wie lib/workspace.ts) —
 * so funktionieren sie mit dem Service-Client (Router/Machine-Auth) wie mit dem
 * Cookie-Client (Dashboard-Pairing-Anzeige).
 */

/** Projekt zu einer Telegram-`chat_id` auflösen — nur VERIFIZIERTE Links zählen. */
export async function resolveProjectByChatId(
  supabase: SupabaseClient,
  chatId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('bernd_channel_links')
    .select('project_id')
    .eq('channel', 'telegram')
    .eq('chat_id', chatId)
    .not('verified_at', 'is', null)
    .maybeSingle();

  if (error) {
    console.error('[bernd/channel] resolveProjectByChatId failed:', error.message);
    return null;
  }
  return (data?.project_id as string | undefined) ?? null;
}

export interface VerifyPairingResult {
  ok: boolean;
  projectId?: string;
  /** Kurzer, für den Nutzer verständlicher Grund bei ok=false (z.B. "Code ungültig"). */
  reason?: string;
}

/**
 * Pairing-Code aus `/start <code>` gegen eine offene (noch unverifizierte)
 * `bernd_channel_links`-Zeile prüfen und bei Treffer `verified_at` setzen. Der Code
 * wird vom Dashboard beim Anlegen der Zeile vergeben (pairing_code), `chat_id` ist zu
 * diesem Zeitpunkt noch unbekannt/leer — wir matchen daher NUR über den Code und
 * schreiben die `chat_id` beim Verifizieren fest (erstmaliges Pairing) bzw. matchen
 * eine bereits mit dieser chat_id verknüpfte Zeile erneut (idempotent).
 */
export async function verifyPairing(
  supabase: SupabaseClient,
  args: { chatId: string; pairingCode: string },
): Promise<VerifyPairingResult> {
  const code = args.pairingCode.trim();
  if (!code) return { ok: false, reason: 'Pairing-Code fehlt.' };

  // Bereits mit dieser chat_id verknüpft und verifiziert? → idempotent ok.
  const { data: already } = await supabase
    .from('bernd_channel_links')
    .select('project_id, verified_at')
    .eq('channel', 'telegram')
    .eq('chat_id', args.chatId)
    .maybeSingle();
  if (already?.verified_at) {
    return { ok: true, projectId: already.project_id as string };
  }

  const { data: candidate, error } = await supabase
    .from('bernd_channel_links')
    .select('id, project_id, verified_at')
    .eq('channel', 'telegram')
    .eq('pairing_code', code)
    .is('verified_at', null)
    .maybeSingle();

  if (error) {
    console.error('[bernd/channel] verifyPairing lookup failed:', error.message);
    return { ok: false, reason: 'Pairing konnte nicht geprüft werden.' };
  }
  if (!candidate) {
    return { ok: false, reason: 'Pairing-Code ungültig oder bereits verwendet.' };
  }

  const { data: updated, error: updateError } = await supabase
    .from('bernd_channel_links')
    .update({ chat_id: args.chatId, verified_at: new Date().toISOString() })
    .eq('id', candidate.id as string)
    .select('project_id')
    .single();

  if (updateError || !updated) {
    console.error('[bernd/channel] verifyPairing update failed:', updateError?.message);
    return { ok: false, reason: 'Pairing konnte nicht abgeschlossen werden.' };
  }

  return { ok: true, projectId: updated.project_id as string };
}

/** Eine Router-Nachricht (in oder out) persistieren. */
export async function persistBerndMessage(
  supabase: SupabaseClient,
  msg: Omit<BerndMessage, 'id' | 'created_at'>,
): Promise<void> {
  const { error } = await supabase.from('bernd_messages').insert({
    project_id: msg.project_id,
    chat_id: msg.chat_id,
    direction: msg.direction,
    role: msg.role,
    content: msg.content,
    media_kind: msg.media_kind,
    meta: msg.meta ?? {},
  });
  if (error) {
    console.error('[bernd/channel] persistBerndMessage failed:', error.message);
  }
}

/** Letzte N Nachrichten eines Chats laden, chronologisch (älteste zuerst). */
export async function loadRecentMessages(
  supabase: SupabaseClient,
  args: { projectId: string; chatId: string; limit: number },
): Promise<BerndMessage[]> {
  const { data, error } = await supabase
    .from('bernd_messages')
    .select('*')
    .eq('project_id', args.projectId)
    .eq('chat_id', args.chatId)
    .order('created_at', { ascending: false })
    .limit(args.limit);

  if (error) {
    console.error('[bernd/channel] loadRecentMessages failed:', error.message);
    return [];
  }
  return ((data as BerndMessage[] | null) ?? []).reverse();
}
