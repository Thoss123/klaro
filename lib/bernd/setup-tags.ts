import { SETUP_SCOPE_IDS } from '@/lib/bernd/scopes';
import type { BerndSetupState, ScopeStatus, SetupScope } from '@/lib/bernd/types';

/**
 * Tag-Parser + State-Reducer für Bernds Setup-Chat (WP2, siehe Architekturplan
 * `nein-nur-handwerker-das-mutable-charm.md` §WP2 und das Tag-Set in
 * `knowledge/templates/bausteine/bernd-setup-prompt.md` Abschnitt 3). Pure Funktionen,
 * kein I/O — der Aufrufer (Setup-Route) puffert den vollen Assistant-Text, parst ihn hier
 * und persistiert das Ergebnis selbst (siehe `lib/bernd/config.ts#upsertBerndSetupState`).
 *
 * Der `<options>`-Tag gehört NICHT hierher — der ist 1:1 aus Axantilo übernommen und läuft
 * über `lib/strip-internal-tags.ts` + `components/chat/OptionsCard.tsx`.
 */

const PROFIL_FELDER = [
  'gewerk',
  'firmenname',
  'mitarbeiter',
  'standort',
  'ton',
  'ansprechpartner',
  'rolle',
  'website',
] as const;
type ProfilFeld = (typeof PROFIL_FELDER)[number];

const SCOPE_STATUS_WERTE: ScopeStatus[] = ['vorgeschlagen', 'gewaehlt', 'abgelehnt'];

const FORTSCHRITT_THEMEN = ['betrieb', 'aufgaben', 'wissen', 'regeln'] as const;
type FortschrittThema = (typeof FORTSCHRITT_THEMEN)[number];

const GETCREDENTIAL_TOOLS = ['email', 'telegram'] as const;
type GetcredentialTool = (typeof GETCREDENTIAL_TOOLS)[number];

/** Diskriminierte Union über alle Bernd-Setup-Steuer-Tags (Tag-Set siehe Dateikommentar). */
export type SetupTag =
  | { type: 'profil'; feld: ProfilFeld; value: string }
  | { type: 'scope'; id: string; status: ScopeStatus }
  | { type: 'ablauf'; scope: string; frage: string; antwort: string }
  | { type: 'ziel'; text: string }
  | { type: 'regel'; text: string }
  | { type: 'einschaetzung'; feld: string; text: string }
  | { type: 'fortschritt'; thema: FortschrittThema; prozent: number }
  | { type: 'zukunft'; text: string }
  | { type: 'getcredential'; tool: GetcredentialTool }
  | { type: 'wissen_anfrage'; typ: string; anzahl: number }
  | { type: 'zusammenfassung_bestaetigt' };

/** Alle bekannten Tag-Namen unseres Namensraums — jede so benannte Klammer wird aus dem sichtbaren Text entfernt, unabhängig davon, ob die Attribute gültig sind. */
type SetupTagName =
  | 'profil'
  | 'scope'
  | 'ablauf'
  | 'ziel'
  | 'regel'
  | 'einschaetzung'
  | 'fortschritt'
  | 'zukunft'
  | 'getcredential'
  | 'wissen_anfrage'
  | 'zusammenfassung_bestaetigt';

/** Attribute eines Tag-Openers parsen (`feld="gewerk" status="..."` → { feld: 'gewerk', status: '...' }). */
function parseAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr))) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

function nonEmpty(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Extrahiert ALLE Tags des Sets aus einem vollständigen Assistant-Text und liefert den
 * sichtbaren Text ohne Tags. Robust gegen Attribut-Reihenfolge und Whitespace (Regex pro
 * Tag-Typ, kein XML-Parser). Ungültige/unvollständige Vorkommen eines bekannten Tag-Namens
 * werden trotzdem aus dem Text entfernt (sonst sieht der Nutzer Steuer-Syntax) — sie landen
 * nur nicht im `tags`-Array.
 */
export function parseSetupTags(text: string): { cleanText: string; tags: SetupTag[] } {
  if (!text) return { cleanText: '', tags: [] };

  const tags: SetupTag[] = [];
  let cleanText = text;

  const consume = (
    name: SetupTagName,
    handler: (attrs: Record<string, string>, inner: string | undefined) => SetupTag | null,
  ) => {
    const re = new RegExp(`<\\s*${name}\\b([^>]*?)(?:/>|>([\\s\\S]*?)<\\s*/\\s*${name}\\s*>)`, 'gi');
    cleanText = cleanText.replace(re, (_match, attrsStr: string, inner: string | undefined) => {
      const attrs = parseAttrs(attrsStr ?? '');
      const tag = handler(attrs, inner?.trim());
      if (tag) tags.push(tag);
      return '';
    });
  };

  consume('profil', (attrs, inner) => {
    const feld = attrs.feld;
    if (!nonEmpty(feld) || !nonEmpty(inner)) return null;
    if (!(PROFIL_FELDER as readonly string[]).includes(feld)) return null;
    return { type: 'profil', feld: feld as ProfilFeld, value: inner as string };
  });

  consume('scope', (attrs) => {
    const id = attrs.id;
    const status = attrs.status;
    if (!nonEmpty(id) || !SETUP_SCOPE_IDS.includes(id)) return null;
    if (!nonEmpty(status) || !SCOPE_STATUS_WERTE.includes(status as ScopeStatus)) return null;
    return { type: 'scope', id, status: status as ScopeStatus };
  });

  consume('ablauf', (attrs, inner) => {
    const scope = attrs.scope;
    const frage = attrs.frage;
    if (!nonEmpty(scope) || !SETUP_SCOPE_IDS.includes(scope)) return null;
    if (!nonEmpty(frage) || !nonEmpty(inner)) return null;
    return { type: 'ablauf', scope, frage, antwort: inner as string };
  });

  consume('ziel', (_attrs, inner) => (nonEmpty(inner) ? { type: 'ziel', text: inner } : null));

  consume('regel', (_attrs, inner) => (nonEmpty(inner) ? { type: 'regel', text: inner } : null));

  consume('einschaetzung', (attrs, inner) => {
    const feld = attrs.feld;
    if (!nonEmpty(feld) || !nonEmpty(inner)) return null;
    return { type: 'einschaetzung', feld, text: inner as string };
  });

  consume('fortschritt', (attrs) => {
    const thema = attrs.thema;
    if (!nonEmpty(thema) || !(FORTSCHRITT_THEMEN as readonly string[]).includes(thema)) return null;
    const raw = Number(attrs.prozent);
    if (!Number.isFinite(raw)) return null;
    const prozent = Math.min(100, Math.max(0, Math.round(raw)));
    return { type: 'fortschritt', thema: thema as FortschrittThema, prozent };
  });

  consume('zukunft', (_attrs, inner) => (nonEmpty(inner) ? { type: 'zukunft', text: inner } : null));

  consume('getcredential', (attrs) => {
    const tool = attrs.tool;
    if (!nonEmpty(tool) || !(GETCREDENTIAL_TOOLS as readonly string[]).includes(tool)) return null;
    return { type: 'getcredential', tool: tool as GetcredentialTool };
  });

  consume('wissen_anfrage', (attrs) => {
    const typ = attrs.typ;
    if (!nonEmpty(typ)) return null;
    const rawAnzahl = Number(attrs.anzahl);
    const anzahl = Number.isFinite(rawAnzahl) && rawAnzahl > 0 ? Math.round(rawAnzahl) : 1;
    return { type: 'wissen_anfrage', typ, anzahl };
  });

  consume('zusammenfassung_bestaetigt', () => ({ type: 'zusammenfassung_bestaetigt' }));

  // Leerzeilen-Müll aufräumen, der durch entfernte Tags übrig bleibt.
  cleanText = cleanText
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { cleanText, tags };
}

/**
 * Akkumuliert erkannte Tags in einen Patch fürs `upsertBerndSetupState`. `getcredential`
 * und `wissen_anfrage` erzeugen KEINEN State-Patch (reine UI-Aktionen) — die gibt der
 * Aufrufer separat als `uiTags` ans Frontend weiter.
 */
export function tagsToPatch(tags: SetupTag[]): Partial<BerndSetupState> {
  const patch: Partial<BerndSetupState> = {};

  let profil: BerndSetupState['profil'] | undefined;
  const scopes: SetupScope[] = [];
  let ablauf: Record<string, Record<string, string>> | undefined;
  const ziele: string[] = [];
  const regeln: string[] = [];
  let einschaetzung: Record<string, string> | undefined;
  let fortschritt: BerndSetupState['fortschritt'] | undefined;
  const zukunft: string[] = [];

  for (const tag of tags) {
    switch (tag.type) {
      case 'profil':
        profil = { ...profil, [tag.feld]: tag.value };
        break;
      case 'scope':
        scopes.push({ id: tag.id, status: tag.status });
        break;
      case 'ablauf':
        ablauf = { ...ablauf, [tag.scope]: { ...(ablauf?.[tag.scope] ?? {}), [tag.frage]: tag.antwort } };
        break;
      case 'ziel':
        ziele.push(tag.text);
        break;
      case 'regel':
        regeln.push(tag.text);
        break;
      case 'einschaetzung':
        einschaetzung = { ...einschaetzung, [tag.feld]: tag.text };
        break;
      case 'fortschritt':
        fortschritt = { ...fortschritt, [tag.thema]: tag.prozent };
        break;
      case 'zukunft':
        zukunft.push(tag.text);
        break;
      case 'getcredential':
      case 'wissen_anfrage':
        // reine UI-Aktionen — kein setup_state-Patch, siehe Dateikommentar.
        break;
      case 'zusammenfassung_bestaetigt':
        patch.zusammenfassung_bestaetigt = true;
        break;
    }
  }

  if (profil) patch.profil = profil;
  if (scopes.length > 0) patch.scopes = scopes;
  if (ablauf) patch.ablauf = ablauf;
  if (ziele.length > 0) patch.ziele = ziele;
  if (regeln.length > 0) patch.regeln = regeln;
  if (einschaetzung) patch.einschaetzung = einschaetzung;
  if (fortschritt) patch.fortschritt = fortschritt;
  if (zukunft.length > 0) patch.zukunft = zukunft;

  return patch;
}

/**
 * Gibt den Teil eines (noch wachsenden) Streaming-Puffers zurück, der sicher sichtbar
 * gestreamt werden darf, und hält einen potenziell angefangenen Steuer-Tag zurück (alles ab
 * dem letzten `<`, wenn danach noch kein `>` kam und der Rest wie der Beginn eines Tags
 * aussieht). Damit kann das Frontend live streamen, ohne halbe Tags aufblitzen zu lassen —
 * reiner Fließtext mit einem "<" (z.B. "< 5 Minuten") wird NICHT zurückgehalten.
 */
export function splitVisibleStream(buffer: string): { visible: string; holdback: string } {
  if (!buffer) return { visible: '', holdback: '' };

  const lastLt = buffer.lastIndexOf('<');
  if (lastLt === -1) return { visible: buffer, holdback: '' };

  const tail = buffer.slice(lastLt);
  // Nach dem letzten "<" folgt bereits ein ">" → der (potenzielle) Tag ist vollständig im
  // Puffer; parseSetupTags schneidet ihn später aus dem fertigen Text.
  if (tail.includes('>')) return { visible: buffer, holdback: '' };

  const candidate = tail.slice(1); // Rest nach dem "<"
  const looksLikeTagStart = candidate === '' || /^[a-zA-Z_/]/.test(candidate);
  if (!looksLikeTagStart) return { visible: buffer, holdback: '' };

  return { visible: buffer.slice(0, lastLt), holdback: tail };
}
