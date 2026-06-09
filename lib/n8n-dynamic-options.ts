/**
 * Dynamische Dropdown-Optionen, die Klaro direkt über die externe API lädt
 * (z. B. Airtable Bases/Tables). n8n-interne listSearch-/loadOptions-Methoden
 * können wir nicht ausführen — also sprechen wir die Anbieter-API selbst an,
 * mit dem entschlüsselten User-Credential.
 */

import type { N8nPropertyOption } from './n8n-catalog-types';

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;

/** resourceLocator-Werte ({ mode, value }) oder Plain-Strings auf den Rohwert reduzieren. */
export function extractResourceLocatorValue(param: unknown): string | null {
  if (param == null) return null;
  if (typeof param === 'string') return param || null;
  if (typeof param === 'number') return String(param);
  if (typeof param === 'object') {
    const v = (param as { value?: unknown }).value;
    if (typeof v === 'string' && v) return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

/** Supabase-Zeilen-IDs sind UUIDs; n8n-Credential-IDs sind kurze nanoid-Strings. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Kann Klaro für dieses Node/Property live Optionen von der externen API laden? */
export function supportsDynamicOptions(nodeType: string, propertyName: string): boolean {
  return /airtable/i.test(nodeType) && (propertyName === 'base' || propertyName === 'table');
}

/**
 * Airtable Meta-API: Bases bzw. Tables einer Base listen.
 * Liefert null, wenn die Anfrage nicht möglich oder nicht erfolgreich war (→ Fallback).
 */
export async function fetchAirtableOptions(opts: {
  token: string;
  propertyName: string;
  parameters?: Record<string, unknown>;
  fetchImpl?: FetchLike;
}): Promise<N8nPropertyOption[] | null> {
  const { token, propertyName, parameters } = opts;
  const doFetch: FetchLike = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const headers = { Authorization: `Bearer ${token}` };

  if (propertyName === 'base') {
    const res = await doFetch('https://api.airtable.com/v0/meta/bases', { headers });
    if (!res.ok) return null;
    const data = await res.json() as { bases?: { id: string; name: string }[] };
    return (data.bases ?? []).map(b => ({ name: b.name, value: b.id }));
  }

  if (propertyName === 'table') {
    // Tables hängen von der gewählten Base ab — ohne Base-ID keine Liste.
    const baseId = extractResourceLocatorValue(parameters?.base);
    if (!baseId) return null;
    const res = await doFetch(
      `https://api.airtable.com/v0/meta/bases/${encodeURIComponent(baseId)}/tables`,
      { headers },
    );
    if (!res.ok) return null;
    const data = await res.json() as { tables?: { id: string; name: string }[] };
    return (data.tables ?? []).map(t => ({ name: t.name, value: t.id }));
  }

  return null;
}
