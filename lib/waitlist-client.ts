import type { WaitlistFormData, WaitlistStatus, WaitlistUpsertBody } from '@/lib/waitlist-types';

const TOKEN_KEY = 'axantilo_waitlist_token';

export function getOrCreateWaitlistSessionToken(): string {
  if (typeof window === 'undefined') return '';
  const existing = localStorage.getItem(TOKEN_KEY);
  if (existing) return existing;
  const token = crypto.randomUUID();
  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

export function clearWaitlistSessionToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}

type SaveWaitlistOptions = {
  status?: WaitlistStatus;
  beacon?: boolean;
  source?: string;
};

export async function saveWaitlistSignup(
  step: number,
  data: WaitlistFormData,
  options: SaveWaitlistOptions = {},
): Promise<{ ok: boolean; id?: string }> {
  if (typeof window === 'undefined') return { ok: false };

  const payload: WaitlistUpsertBody = {
    sessionToken: getOrCreateWaitlistSessionToken(),
    step,
    status: options.status ?? 'partial',
    source: options.source ?? 'landing',
    referrer: document.referrer || undefined,
    data,
  };

  const body = JSON.stringify(payload);

  if (options.beacon && navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    const ok = navigator.sendBeacon('/api/waitlist', blob);
    return { ok };
  }

  try {
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: options.beacon,
    });
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as { id?: string };
    return { ok: true, id: json.id };
  } catch {
    return { ok: false };
  }
}
