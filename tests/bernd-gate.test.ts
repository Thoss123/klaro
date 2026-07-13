import { describe, expect, it } from 'vitest';
import { buildGateStatusText, evaluateGate } from '@/lib/bernd/gate';
import type { BerndSetupState } from '@/lib/bernd/types';

/** Erfüllt alle Pflicht- UND alle optionalen Punkte — Ausgangspunkt für die einzelnen Tests. */
const FULL_SETUP_STATE: BerndSetupState = {
  profil: { gewerk: 'Elektriker', ton: 'du' },
  scopes: [{ id: 'email_triage', status: 'gewaehlt' }],
  ablauf: { email_triage: { eskalation_bei: 'nur dringend' } },
  regeln: ['Rechnungen nie ohne Rückfrage bei Sonderrabatten'],
  wissen: { mail_stilproben: ['workspace/stilproben.md'] },
};

describe('evaluateGate', () => {
  it('canStart=true when every Pflichtpunkt is fulfilled', () => {
    const result = evaluateGate({ setupState: FULL_SETUP_STATE, emailConnected: true, telegramConnected: true });
    expect(result.canStart).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('canStart=false and reports the label when no scope is gewaehlt', () => {
    const state: BerndSetupState = { ...FULL_SETUP_STATE, scopes: [] };
    const result = evaluateGate({ setupState: state, emailConnected: true, telegramConnected: true });
    expect(result.canStart).toBe(false);
    expect(result.missing).toEqual(['Aufgabe gewählt']);
  });

  it('canStart=false and reports the label when email is not connected', () => {
    const result = evaluateGate({ setupState: FULL_SETUP_STATE, emailConnected: false, telegramConnected: true });
    expect(result.canStart).toBe(false);
    expect(result.missing).toEqual(['E-Mail-Postfach verbunden']);
  });

  it('canStart=false and reports the label when telegram is not connected', () => {
    const result = evaluateGate({ setupState: FULL_SETUP_STATE, emailConnected: true, telegramConnected: false });
    expect(result.canStart).toBe(false);
    expect(result.missing).toEqual(['Telegram verbunden']);
  });

  it('canStart=false and reports the label when no Freigabe-Regel is confirmed', () => {
    const state: BerndSetupState = { ...FULL_SETUP_STATE, regeln: [] };
    const result = evaluateGate({ setupState: state, emailConnected: true, telegramConnected: true });
    expect(result.canStart).toBe(false);
    expect(result.missing).toEqual(['Freigabe-Regel bestätigt']);
  });

  it('collects every open Pflichtpunkt at once', () => {
    const state: BerndSetupState = { scopes: [], regeln: [] };
    const result = evaluateGate({ setupState: state, emailConnected: false, telegramConnected: false });
    expect(result.canStart).toBe(false);
    expect(result.missing).toEqual([
      'Aufgabe gewählt',
      'E-Mail-Postfach verbunden',
      'Telegram verbunden',
      'Freigabe-Regel bestätigt',
    ]);
  });

  it('optional items never affect canStart, whether missing or present', () => {
    const bare: BerndSetupState = {
      profil: { gewerk: 'Elektriker' }, // kein ton
      scopes: [{ id: 'email_triage', status: 'gewaehlt' }],
      ablauf: {}, // keine Ablauf-Antworten
      regeln: ['Regel 1'],
      wissen: {}, // keine Stilproben
    };
    const result = evaluateGate({ setupState: bare, emailConnected: true, telegramConnected: true });
    expect(result.canStart).toBe(true);
    const optionalDone = result.items.filter((item) => !item.pflicht).map((item) => item.done);
    expect(optionalDone).toEqual([false, false, false]);

    const full = evaluateGate({ setupState: FULL_SETUP_STATE, emailConnected: true, telegramConnected: true });
    expect(full.canStart).toBe(true);
    const byKey = Object.fromEntries(full.items.map((item) => [item.key, item.done]));
    expect(byKey.ton_gesetzt).toBe(true);
    expect(byKey.ablauf_beantwortet).toBe(true);
    expect(byKey.stilproben_hochgeladen).toBe(true);
  });

  it('ablauf_beantwortet requires an answer for every gewaehlt scope, not just one', () => {
    const state: BerndSetupState = {
      scopes: [
        { id: 'email_triage', status: 'gewaehlt' },
        { id: 'rechnung', status: 'gewaehlt' },
      ],
      ablauf: { email_triage: { eskalation_bei: 'nur dringend' } }, // rechnung fehlt
      regeln: ['Regel 1'],
    };
    const result = evaluateGate({ setupState: state, emailConnected: true, telegramConnected: true });
    const ablaufItem = result.items.find((item) => item.key === 'ablauf_beantwortet');
    expect(ablaufItem?.done).toBe(false);
  });
});

describe('buildGateStatusText', () => {
  it('returns the confirmation sentence once every Pflichtpunkt is fulfilled', () => {
    const result = evaluateGate({ setupState: FULL_SETUP_STATE, emailConnected: true, telegramConnected: true });
    expect(buildGateStatusText(result)).toBe('Alle Pflichtpunkte erfüllt — Zusammenfassung + Bestätigung einholen.');
  });

  it('lists the open Pflichtpunkte, comma-separated, when canStart is false', () => {
    const state: BerndSetupState = { ...FULL_SETUP_STATE, scopes: [] };
    const result = evaluateGate({ setupState: state, emailConnected: false, telegramConnected: true });
    expect(buildGateStatusText(result)).toBe('Offen: Aufgabe gewählt, E-Mail-Postfach verbunden');
  });
});
