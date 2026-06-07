/**
 * Resolve n8n node icon URLs — STRICTLY via API proxy, component falls back to react-icons.
 */

/** Guess tool key from German step label when resolver did not set tool/n8nType. */
export function inferToolFromLabel(label: string): string | null {
  const l = label.toLowerCase();
  if (/youtube|video-?url|shorts/.test(l)) return 'youtube';
  if (/instagram|reel|meta/.test(l)) return 'instagram';
  if (/facebook|meta/.test(l)) return 'facebook';
  if (/tiktok/.test(l)) return 'tiktok';
  if (/gmail|e-?mail|mail/.test(l)) return 'gmail';
  if (/slack|chat/.test(l)) return 'slack';
  if (/notion/.test(l)) return 'notion';
  if (/openai|gpt|ki generiert|ki analysiert|ki schneidet|captions|skript/.test(l)) return 'openai';
  if (/webhook|api/.test(l)) return 'webhook';
  if (/schedule|zeitplan|cron|täglich/.test(l)) return 'schedule';
  if (/http|request/.test(l)) return 'http';
  if (/freigabe|bestätig|human|nutzer prüft|review/.test(l)) return 'human';
  if (/verzweig|wenn|if\b/.test(l)) return 'if';
  if (/trigger|start|hochladen/.test(l)) return 'manual';
  return null;
}

/** Candidate icon URLs in priority order (component tries each until one loads). */
export function getN8nIconCandidates(
  tool?: string | null,
  type?: string | null,
  n8nType?: string | null,
  label?: string | null,
): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const add = (url: string | null | undefined) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      candidates.push(url);
    }
  };

  const short = n8nType ? (n8nType.split('.').pop() || '') : '';
  const isLangchain = Boolean(n8nType?.includes('langchain'));

  // Proxy (n8n-Instanz / unpkg) als primäre Quelle für Icons
  if (n8nType && short) {
    add(`/api/n8n/icon?node=${encodeURIComponent(n8nType)}`);
    if (isLangchain) {
      // Langchain vendor icons (OpenAI, Mistral, Agent, …) — nicht n8n-nodes-base
      const vendor = short.charAt(0).toUpperCase() + short.slice(1);
      add(`/api/n8n/icon?path=${encodeURIComponent(`@n8n/n8n-nodes-langchain/dist/nodes/vendors/${vendor}/${short}.svg`)}`);
      add(`/api/n8n/icon?path=${encodeURIComponent(`@n8n/n8n-nodes-langchain/dist/nodes/${vendor}/${short}.svg`)}`);
    } else {
      const pascal = short.charAt(0).toUpperCase() + short.slice(1);
      add(`/api/n8n/icon?path=${encodeURIComponent(`n8n-nodes-base/dist/nodes/${pascal}/${short}.svg`)}`);
      add(`/api/n8n/icon?path=${encodeURIComponent(`n8n-nodes-base/dist/nodes/${pascal}/${pascal}.svg`)}`);
      // Webhook, IF u. a. nutzen lowercase-Dateinamen
      if (short !== pascal) {
        add(`/api/n8n/icon?path=${encodeURIComponent(`n8n-nodes-base/dist/nodes/${pascal}/${short}.svg`)}`);
      }
    }
  }

  return candidates;
}

/** @deprecated use getN8nIconCandidates — first candidate or null */
export function getN8nIconPath(
  tool?: string | null,
  type?: string | null,
  n8nType?: string | null,
  label?: string | null,
): string | null {
  return getN8nIconCandidates(tool, type, n8nType, label)[0] ?? null;
}

