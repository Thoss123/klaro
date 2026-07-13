import { describe, expect, it } from 'vitest';
import { parseSetupTags, splitVisibleStream, tagsToPatch } from '@/lib/bernd/setup-tags';

describe('parseSetupTags', () => {
  it('parses every tag type with correct fields', () => {
    const text = [
      'Alles klar, Elektriker aus München.',
      '',
      '<profil feld="gewerk">Elektriker</profil>',
      '<profil feld="firmenname">Mustermann GmbH</profil>',
      '<scope id="email_triage" status="gewaehlt"/>',
      '<ablauf scope="email_triage" frage="eskalation_bei">nur dringend</ablauf>',
      '<ziel>Materialbelege automatisch ablegen</ziel>',
      '<regel>Rechnungen nie ohne Rückfrage bei Sonderrabatten</regel>',
      '<einschaetzung feld="betrieb">viel Notdienst-Aufkommen</einschaetzung>',
      '<fortschritt thema="betrieb" prozent="50"/>',
      '<zukunft>später auch Angebote</zukunft>',
      '<getcredential tool="email"/>',
      '<wissen_anfrage typ="mail_stilproben" anzahl="2"/>',
      '<zusammenfassung_bestaetigt/>',
    ].join('\n');

    const { tags, cleanText } = parseSetupTags(text);

    expect(tags).toEqual([
      { type: 'profil', feld: 'gewerk', value: 'Elektriker' },
      { type: 'profil', feld: 'firmenname', value: 'Mustermann GmbH' },
      { type: 'scope', id: 'email_triage', status: 'gewaehlt' },
      { type: 'ablauf', scope: 'email_triage', frage: 'eskalation_bei', antwort: 'nur dringend' },
      { type: 'ziel', text: 'Materialbelege automatisch ablegen' },
      { type: 'regel', text: 'Rechnungen nie ohne Rückfrage bei Sonderrabatten' },
      { type: 'einschaetzung', feld: 'betrieb', text: 'viel Notdienst-Aufkommen' },
      { type: 'fortschritt', thema: 'betrieb', prozent: 50 },
      { type: 'zukunft', text: 'später auch Angebote' },
      { type: 'getcredential', tool: 'email' },
      { type: 'wissen_anfrage', typ: 'mail_stilproben', anzahl: 2 },
      { type: 'zusammenfassung_bestaetigt' },
    ]);

    expect(cleanText).toBe('Alles klar, Elektriker aus München.');
  });

  it('produces tag-free cleanText', () => {
    const text = 'Klingt gut.\n<scope id="angebot" status="vorgeschlagen"/>\n<profil feld="ton">du</profil>';
    const { cleanText } = parseSetupTags(text);
    expect(cleanText).not.toMatch(/[<>]/);
    expect(cleanText).toBe('Klingt gut.');
  });

  it('discards a scope tag with an invalid scope id but still strips it from cleanText', () => {
    const text = 'Passt.\n<scope id="erfunden" status="gewaehlt"/>';
    const { tags, cleanText } = parseSetupTags(text);
    expect(tags).toEqual([]);
    expect(cleanText).toBe('Passt.');
  });

  it('discards a scope tag with an invalid status', () => {
    const text = '<scope id="email_triage" status="vielleicht"/>';
    const { tags, cleanText } = parseSetupTags(text);
    expect(tags).toEqual([]);
    expect(cleanText).toBe('');
  });

  it('discards a getcredential tag with an unknown tool', () => {
    const text = '<getcredential tool="whatsapp"/>';
    const { tags } = parseSetupTags(text);
    expect(tags).toEqual([]);
  });

  it('clamps fortschritt.prozent into 0-100', () => {
    const over = parseSetupTags('<fortschritt thema="aufgaben" prozent="140"/>').tags;
    expect(over).toEqual([{ type: 'fortschritt', thema: 'aufgaben', prozent: 100 }]);

    const under = parseSetupTags('<fortschritt thema="aufgaben" prozent="-20"/>').tags;
    expect(under).toEqual([{ type: 'fortschritt', thema: 'aufgaben', prozent: 0 }]);
  });

  it('is robust against attribute order and extra whitespace', () => {
    const text = '<scope   status="gewaehlt"   id="rechnung"  />';
    const { tags } = parseSetupTags(text);
    expect(tags).toEqual([{ type: 'scope', id: 'rechnung', status: 'gewaehlt' }]);
  });

  it('returns empty result for empty input', () => {
    expect(parseSetupTags('')).toEqual({ cleanText: '', tags: [] });
  });
});

describe('splitVisibleStream', () => {
  it('holds back an angefangenes <profil feld="… tag and releases finished text', () => {
    const buffer = 'Klingt gut, Elektriker.\n<profil feld="gewerk';
    const { visible, holdback } = splitVisibleStream(buffer);
    expect(visible).toBe('Klingt gut, Elektriker.\n');
    expect(holdback).toBe('<profil feld="gewerk');
  });

  it('releases everything once the tag is closed', () => {
    const buffer = 'Text davor <scope id="a" status="gewaehlt"/> Text danach';
    const { visible, holdback } = splitVisibleStream(buffer);
    expect(visible).toBe(buffer);
    expect(holdback).toBe('');
  });

  it('does not hold back a plain "<" that is not tag-shaped (e.g. "< 5 Minuten")', () => {
    const buffer = 'Das dauert < 5 Minuten';
    const { visible, holdback } = splitVisibleStream(buffer);
    expect(visible).toBe(buffer);
    expect(holdback).toBe('');
  });

  it('holds back a bare trailing "<"', () => {
    const buffer = 'Ich schreibe jetzt <';
    const { visible, holdback } = splitVisibleStream(buffer);
    expect(visible).toBe('Ich schreibe jetzt ');
    expect(holdback).toBe('<');
  });

  it('holds back the start of a closing tag', () => {
    const buffer = 'Wert</profi';
    const { visible, holdback } = splitVisibleStream(buffer);
    expect(visible).toBe('Wert');
    expect(holdback).toBe('</profi');
  });

  it('returns the whole buffer as visible when there is no "<" at all', () => {
    const buffer = 'Ganz normaler Text ohne spitze Klammern.';
    const { visible, holdback } = splitVisibleStream(buffer);
    expect(visible).toBe(buffer);
    expect(holdback).toBe('');
  });
});

describe('tagsToPatch', () => {
  it('merges multiple profil tags into one object', () => {
    const patch = tagsToPatch([
      { type: 'profil', feld: 'gewerk', value: 'Elektriker' },
      { type: 'profil', feld: 'firmenname', value: 'Mustermann GmbH' },
      { type: 'profil', feld: 'ton', value: 'du' },
    ]);
    expect(patch.profil).toEqual({ gewerk: 'Elektriker', firmenname: 'Mustermann GmbH', ton: 'du' });
  });

  it('collects scope tags as an array (last write wins is left to the upsert merge layer)', () => {
    const patch = tagsToPatch([
      { type: 'scope', id: 'email_triage', status: 'vorgeschlagen' },
      { type: 'scope', id: 'email_triage', status: 'gewaehlt' },
      { type: 'scope', id: 'angebot', status: 'abgelehnt' },
    ]);
    expect(patch.scopes).toEqual([
      { id: 'email_triage', status: 'vorgeschlagen' },
      { id: 'email_triage', status: 'gewaehlt' },
      { id: 'angebot', status: 'abgelehnt' },
    ]);
  });

  it('nests ablauf answers per scope and question', () => {
    const patch = tagsToPatch([
      { type: 'ablauf', scope: 'email_triage', frage: 'eskalation_bei', antwort: 'nur dringend' },
      { type: 'ablauf', scope: 'rechnung', frage: 'zahlungsziel_tage', antwort: '14' },
    ]);
    expect(patch.ablauf).toEqual({
      email_triage: { eskalation_bei: 'nur dringend' },
      rechnung: { zahlungsziel_tage: '14' },
    });
  });

  it('collects ziele, regeln and zukunft as arrays', () => {
    const patch = tagsToPatch([
      { type: 'ziel', text: 'Ziel A' },
      { type: 'regel', text: 'Regel A' },
      { type: 'zukunft', text: 'Idee A' },
    ]);
    expect(patch.ziele).toEqual(['Ziel A']);
    expect(patch.regeln).toEqual(['Regel A']);
    expect(patch.zukunft).toEqual(['Idee A']);
  });

  it('sets zusammenfassung_bestaetigt to true', () => {
    const patch = tagsToPatch([{ type: 'zusammenfassung_bestaetigt' }]);
    expect(patch.zusammenfassung_bestaetigt).toBe(true);
  });

  it('ignores getcredential and wissen_anfrage tags (UI-only)', () => {
    const patch = tagsToPatch([
      { type: 'getcredential', tool: 'email' },
      { type: 'wissen_anfrage', typ: 'mail_stilproben', anzahl: 2 },
    ]);
    expect(patch).toEqual({});
  });

  it('returns an empty patch for no tags', () => {
    expect(tagsToPatch([])).toEqual({});
  });
});
