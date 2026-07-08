/**
 * Baut/aktualisiert die drei Agenten-Workflows in n8n (REST, deterministisch):
 *  1. AXANTILO: E-Mail Triage & Entwurf   (Umbau auf /api/agent/llm — zentrale Prompts + Credits)
 *  2. AXANTILO: WhatsApp Steuerkanal      (Inbound: SENDEN / Revision / Ad-hoc-Assistent)
 *  3. AXANTILO: Learning Engine           (Regeln aus Entwurf vs. finaler Version lernen)
 *
 * Aufruf: npx tsx scripts/build-agent-workflows.ts [--flow1-id <id>]
 * Idempotent: Flow 1 wird per PUT ersetzt; Flow 2/3 werden per Namens-Suche gefunden oder angelegt.
 */
import fs from 'fs';
import path from 'path';

// .env.local manuell laden (kein dotenv im Projekt)
for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const BASE = process.env.N8N_API_URL!;
const KEY = process.env.N8N_API_KEY!;

// ── Instanz-Konfiguration (Test-Setup) ──────────────────────────────────────
const APP = 'https://www.axantilo.com';
const PROJECT_ID = '712db8db-bd73-4392-915e-e9fa1a4ea744';
const PERSONA = 'rules/persona_thomas.md';
// contact-Format für pending-Lookup = Twilio-`From` beim Inbound ('whatsapp:+43…');
// der Twilio-SEND-Node bekommt die NACKTE Nummer — toWhatsapp:true präfixt selbst
// (doppeltes 'whatsapp:' → Twilio-Error 21211 "not a valid phone number").
const OWNER_WA = 'whatsapp:+4367762853686';
const OWNER_WA_NUMBER = '+4367762853686';
// WhatsApp-Sends laufen über die Twilio-Sandbox-Nummer (universell +14155238886) —
// die eigene Twilio-Nummer ist KEIN WhatsApp-Channel (Error 63007). Nach Produktions-
// Freischaltung eines eigenen WhatsApp-Senders hier die eigene Nummer eintragen.
const TWILIO_FROM = '+14155238886';
const FLOW1_ID = process.argv.includes('--flow1-id')
  ? process.argv[process.argv.indexOf('--flow1-id') + 1]
  : 'fdGLWQlJDiCRW4yU';
const LEARNING_WEBHOOK_PATH = 'learning-engine-ax7k2';
const WA_WEBHOOK_PATH = 'whatsapp-inbound-ax7k2';

const CRED_HEADER = { httpHeaderAuth: { id: '9BDVKtbH7SNiYAwh', name: 'Axantilo Workspace Token' } };
const CRED_GMAIL = { gmailOAuth2: { id: 'Kaiu4Jj4F5s44viQ', name: 'Gmail account' } };
const CRED_TWILIO = { twilioApi: { id: 'FBI90qfJghlmNyce', name: 'Twilio account' } };

async function n8n<T = Record<string, unknown>>(p: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${p}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-N8N-API-KEY': KEY, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`n8n ${init.method || 'GET'} ${p} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** HTTP-Node gegen die App-API (Header-Auth-Credential). */
function appHttp(name: string, pos: [number, number], opts: { method?: string; url: string; jsonBody?: string }) {
  return {
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: pos,
    credentials: CRED_HEADER,
    parameters: {
      ...(opts.method && opts.method !== 'GET' ? { method: opts.method } : {}),
      url: opts.url,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      ...(opts.jsonBody ? { sendBody: true, specifyBody: 'json', jsonBody: opts.jsonBody } : {}),
      options: {},
    },
  };
}

function twilio(name: string, pos: [number, number], message: string) {
  return {
    name,
    type: 'n8n-nodes-base.twilio',
    typeVersion: 1,
    position: pos,
    credentials: CRED_TWILIO,
    parameters: { from: TWILIO_FROM, to: OWNER_WA_NUMBER, toWhatsapp: true, message, options: {} },
  };
}

const chain = (pairs: Array<[string, string]>) =>
  Object.fromEntries(pairs.map(([a, b]) => [a, { main: [[{ node: b, type: 'main', index: 0 }]] }]));

// ═════════════════ Flow 1: E-Mail Triage — 8 Kategorien, spezifische Routen ═════════════════
// 0 lead_inquiry → Entwurf | 1 scheduling → Kalender + Entwurf | 2 support_faq → Entwurf
// 3 vendor_billing → Kurzinfo per WhatsApp | 4 system_alerts → nur bei urgency=high Push
// 5 newsletters + 6 spam_marketing → gelesen markieren + archivieren | 7 other → Entwurf
const CATEGORIES = [
  'lead_inquiry', 'scheduling', 'support_faq', 'vendor_billing',
  'system_alerts', 'newsletters', 'spam_marketing', 'other',
] as const;

const EMAIL_TEXT = "($('Neue E-Mail').item.json.textPlain || $('Neue E-Mail').item.json.snippet || '')";
const EMAIL_USER = `'Betreff: ' + ($('Neue E-Mail').item.json.subject || '') + '\\nVon: ' + ($('Neue E-Mail').item.json.from || '') + '\\n\\n' + ${EMAIL_TEXT}`;

/** Gmail-Postfach-Aktion (markAsRead/removeLabels) — fail-open, damit Aufräumen nie den Flow killt. */
function gmailAction(name: string, pos: [number, number], operation: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    type: 'n8n-nodes-base.gmail',
    typeVersion: 2,
    position: pos,
    credentials: CRED_GMAIL,
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'message',
      operation,
      messageId: "={{ $('Neue E-Mail').item.json.id }}",
      ...extra,
    },
  };
}

const flow1 = {
  name: 'AXANTILO: E-Mail Triage & Entwurf',
  nodes: [
    {
      name: 'Neue E-Mail',
      type: 'n8n-nodes-base.gmailTrigger',
      typeVersion: 1,
      position: [-260, 460] as [number, number],
      credentials: CRED_GMAIL,
      parameters: { pollTimes: { item: [{ mode: 'everyMinute' }] }, simple: false, filters: {}, options: {} },
    },
    appHttp('KI: Kategorisieren', [-40, 460], {
      method: 'POST',
      url: `${APP}/api/agent/llm`,
      jsonBody: `={{ JSON.stringify({ project_id: '${PROJECT_ID}', prompt_key: 'email/classify', user: ${EMAIL_USER} }) }}`,
    }),
    {
      name: 'Kategorie parsen',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [180, 460] as [number, number],
      parameters: {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `const VALID = ${JSON.stringify(CATEGORIES)};
const PROMPT_BY_CATEGORY = {
  lead_inquiry: 'email/draft_lead_inquiry',
  support_faq: 'email/draft_support_faq',
  other: 'email/draft_other',
};
return $input.all().map(item => {
  let category = 'other', urgency = 'medium', reason = '';
  try {
    const parsed = JSON.parse(item.json.text);
    if (parsed && VALID.includes(parsed.category)) category = parsed.category;
    if (['low','medium','high'].includes(parsed?.urgency)) urgency = parsed.urgency;
    if (typeof parsed?.reason === 'string') reason = parsed.reason;
  } catch (e) { /* ungültiges LLM-JSON -> sicherer Fallback "other" */ }
  return { json: { category, urgency, reason, prompt_key: PROMPT_BY_CATEGORY[category] || null } };
});`,
      },
    },
    {
      name: 'Switch',
      type: 'n8n-nodes-base.switch',
      typeVersion: 3.4,
      position: [420, 460] as [number, number],
      parameters: {
        mode: 'rules',
        rules: {
          values: CATEGORIES.map((c) => ({
            outputKey: c,
            renameOutput: true,
            conditions: {
              combinator: 'and',
              options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' },
              conditions: [{ leftValue: '={{ $json.category }}', operator: { type: 'string', operation: 'equals' }, rightValue: c }],
            },
          })),
        },
        options: { fallbackOutput: 'none' },
      },
    },

    // ── Entwurf-Route (lead_inquiry / support_faq / other) ──────────────────
    appHttp('KI: Entwurf schreiben', [720, 120], {
      method: 'POST',
      url: `${APP}/api/agent/llm`,
      jsonBody: `={{ JSON.stringify({ project_id: '${PROJECT_ID}', prompt_key: $json.prompt_key, persona_path: '${PERSONA}', user: ${EMAIL_USER} }) }}`,
    }),

    // ── Termin-Route (scheduling): Kalender lesen → Kontext → Entwurf ──────
    {
      name: 'Kalender lesen',
      type: 'n8n-nodes-base.googleCalendar',
      typeVersion: 1.3,
      position: [720, 320] as [number, number],
      // DISABLED ausgeliefert: n8n reicht bei disabled Nodes das Item durch → der
      // Kontext-Builder erzeugt den "kein Kalender-Zugriff"-Fallback. Sobald der User
      // Google Calendar verbindet (3-Klick-OAuth), aktiviert er den Node im Editor.
      // (Aktiv ohne Credential würde der Publish-Validator den PUT ablehnen.)
      disabled: true,
      onError: 'continueRegularOutput',
      alwaysOutputData: true,
      parameters: {
        resource: 'event',
        operation: 'getAll',
        calendar: { __rl: true, mode: 'id', value: 'primary' },
        limit: 20,
        options: {
          timeMin: '={{ $now.toISO() }}',
          timeMax: "={{ $now.plus(7, 'days').toISO() }}",
          singleEvents: true,
          orderBy: 'startTime',
        },
      },
    },
    {
      name: 'Kalender-Kontext bauen',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [940, 320] as [number, number],
      parameters: {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `const events = $input.all().map(i => i.json).filter(e => e && (e.start || e.summary));
let kalender_kontext;
if (!events.length) {
  kalender_kontext = 'Kein Kalender-Zugriff oder keine Termine in den nächsten 7 Tagen gefunden — schlage KEINE konkreten Slots vor, sondern frage nach 2-3 Wunschterminen.';
} else {
  kalender_kontext = 'Belegte Termine der nächsten 7 Tage (heute ist ' + new Date().toISOString().slice(0, 10) + '). Schlage 2-3 freie Fenster innerhalb der Öffnungszeiten vor, die NICHT kollidieren:\\n'
    + events.map(e => '- ' + (e.start?.dateTime || e.start?.date || '?') + ' bis ' + (e.end?.dateTime || e.end?.date || '?') + ': ' + (e.summary || 'belegt')).join('\\n');
}
return [{ json: { kalender_kontext } }];`,
      },
    },
    appHttp('KI: Termin-Entwurf', [1160, 320], {
      method: 'POST',
      url: `${APP}/api/agent/llm`,
      jsonBody: `={{ JSON.stringify({ project_id: '${PROJECT_ID}', prompt_key: 'email/draft_scheduling', persona_path: '${PERSONA}', variables: { kalender_kontext: $json.kalender_kontext }, user: ${EMAIL_USER} }) }}`,
    }),

    // ── Gemeinsames Ende der Entwurf-Wege: Freigabe + WhatsApp ──────────────
    appHttp('Freigabe anlegen', [1400, 220], {
      method: 'POST',
      url: `${APP}/api/agent/pending`,
      jsonBody: `={{ JSON.stringify({ project_id: '${PROJECT_ID}', contact: '${OWNER_WA}', payload: { draft: $json.text, first_draft: $json.text, feedback_log: [], category: $('Kategorie parsen').item.json.category, original_email: ${EMAIL_TEXT}, send_target: ($('Neue E-Mail').item.json.from || ''), subject: ($('Neue E-Mail').item.json.subject || ''), provider: 'gmail', persona: '${PERSONA}' } }) }}`,
    }),
    twilio(
      'WhatsApp: Entwurf zur Freigabe',
      [1640, 220],
      "=📧 Neuer Entwurf ({{ $('Kategorie parsen').item.json.category }}) für: {{ $('Neue E-Mail').item.json.from }}\nBetreff: {{ $('Neue E-Mail').item.json.subject }}\n\n{{ $('Freigabe anlegen').item.json.action.payload.draft }}\n\n— Antworte SENDEN zum Abschicken, oder schreib, was geändert werden soll.",
    ),

    // ── vendor_billing: schnelle Info-Message, kein Entwurf ─────────────────
    appHttp('KI: Rechnungs-Info', [720, 560], {
      method: 'POST',
      url: `${APP}/api/agent/llm`,
      jsonBody: `={{ JSON.stringify({ project_id: '${PROJECT_ID}', prompt_key: 'email/summarize_vendor_billing', user: (${EMAIL_USER}).slice(0, 2000) }) }}`,
    }),
    twilio(
      'WhatsApp: Rechnungs-Info',
      [960, 560],
      "=💰 Eingangsrechnung/Beleg:\n{{ $json.text }}\n\n(Nur zur Info — Mail bleibt im Postfach, keine Antwort nötig.)",
    ),

    // ── system_alerts: nur bei urgency=high stören ──────────────────────────
    {
      name: 'Wichtig?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [720, 720] as [number, number],
      parameters: {
        conditions: {
          combinator: 'and',
          options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
          conditions: [{ leftValue: '={{ $json.urgency }}', operator: { type: 'string', operation: 'equals' }, rightValue: 'high' }],
        },
      },
    },
    twilio(
      'WhatsApp: System-Alert',
      [960, 680],
      "=⚠️ System-Alert ({{ $('Kategorie parsen').item.json.reason }}):\n{{ $('Neue E-Mail').item.json.subject }}\nVon: {{ $('Neue E-Mail').item.json.from }}",
    ),
    { name: 'Alert ignoriert', type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [960, 800] as [number, number], parameters: {} },

    // ── newsletters + spam_marketing: Postfach aufräumen ────────────────────
    gmailAction('Als gelesen markieren', [720, 920], 'markAsRead'),
    gmailAction('Archivieren', [960, 920], 'removeLabels', { labelIds: ['INBOX'] }),
  ],
  connections: {
    ...chain([
      ['Neue E-Mail', 'KI: Kategorisieren'],
      ['KI: Kategorisieren', 'Kategorie parsen'],
      ['Kategorie parsen', 'Switch'],
      ['KI: Entwurf schreiben', 'Freigabe anlegen'],
      ['Kalender lesen', 'Kalender-Kontext bauen'],
      ['Kalender-Kontext bauen', 'KI: Termin-Entwurf'],
      ['KI: Termin-Entwurf', 'Freigabe anlegen'],
      ['Freigabe anlegen', 'WhatsApp: Entwurf zur Freigabe'],
      ['KI: Rechnungs-Info', 'WhatsApp: Rechnungs-Info'],
      ['Als gelesen markieren', 'Archivieren'],
    ]),
    Switch: {
      main: [
        [{ node: 'KI: Entwurf schreiben', type: 'main', index: 0 }],   // 0 lead_inquiry
        [{ node: 'Kalender lesen', type: 'main', index: 0 }],          // 1 scheduling
        [{ node: 'KI: Entwurf schreiben', type: 'main', index: 0 }],   // 2 support_faq
        [{ node: 'KI: Rechnungs-Info', type: 'main', index: 0 }],      // 3 vendor_billing
        [{ node: 'Wichtig?', type: 'main', index: 0 }],                // 4 system_alerts
        [{ node: 'Als gelesen markieren', type: 'main', index: 0 }],   // 5 newsletters
        [{ node: 'Als gelesen markieren', type: 'main', index: 0 }],   // 6 spam_marketing
        [{ node: 'KI: Entwurf schreiben', type: 'main', index: 0 }],   // 7 other
      ],
    },
    'Wichtig?': {
      main: [
        [{ node: 'WhatsApp: System-Alert', type: 'main', index: 0 }],
        [{ node: 'Alert ignoriert', type: 'main', index: 0 }],
      ],
    },
  },
  settings: { executionOrder: 'v1', availableInMCP: true },
};

// ═════════════════ Flow 2: WhatsApp Steuerkanal ═════════════════
const ACT = "$('Route bestimmen').item.json";

const flow2 = {
  name: 'AXANTILO: WhatsApp Steuerkanal',
  nodes: [
    {
      name: 'WhatsApp eingehend',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 300] as [number, number],
      parameters: { httpMethod: 'POST', path: WA_WEBHOOK_PATH, options: {} },
    },
    {
      name: 'Nachricht lesen',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [220, 300] as [number, number],
      parameters: {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `const b = $json.body || {};
const text = String(b.Body || '').trim();
const from = String(b.From || '');
const is_approval = /^(senden|ok|passt|ja|go|send)[.!\\s]*$/i.test(text);
return [{ json: { text, from, is_approval } }];`,
      },
    },
    appHttp('Offene Freigabe suchen', [440, 300], {
      url: `=${APP}/api/agent/pending?project_id=${PROJECT_ID}&status=pending&contact={{ encodeURIComponent($json.from) }}`,
    }),
    {
      name: 'Route bestimmen',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [660, 300] as [number, number],
      parameters: {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `const action = $json.action || null;
const msg = $('Nachricht lesen').item.json;
const route = !action ? 'adhoc' : (msg.is_approval ? 'send' : 'revise');
return [{ json: { route, action, text: msg.text, from: msg.from } }];`,
      },
    },
    {
      name: 'Route',
      type: 'n8n-nodes-base.switch',
      typeVersion: 3.4,
      position: [880, 300] as [number, number],
      parameters: {
        mode: 'rules',
        rules: {
          values: ['send', 'revise', 'adhoc'].map((r) => ({
            outputKey: r,
            renameOutput: true,
            conditions: {
              combinator: 'and',
              options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' },
              conditions: [{ leftValue: '={{ $json.route }}', operator: { type: 'string', operation: 'equals' }, rightValue: r }],
            },
          })),
        },
        options: { fallbackOutput: 'none' },
      },
    },
    // ── send ──
    {
      name: 'E-Mail senden',
      type: 'n8n-nodes-base.gmail',
      typeVersion: 2,
      position: [1140, 80] as [number, number],
      credentials: CRED_GMAIL,
      parameters: {
        resource: 'message',
        operation: 'send',
        sendTo: `={{ ${ACT}.action.payload.send_target }}`,
        subject: `={{ 'Re: ' + (${ACT}.action.payload.subject || '') }}`,
        emailType: 'text',
        message: `={{ ${ACT}.action.payload.draft }}`,
        options: {},
      },
    },
    appHttp('Freigabe abschließen', [1360, 80], {
      method: 'PATCH',
      url: `${APP}/api/agent/pending`,
      jsonBody: `={{ JSON.stringify({ id: ${ACT}.action.id, project_id: '${PROJECT_ID}', status: 'sent' }) }}`,
    }),
    {
      ...appHttp('Lernen anstoßen', [1580, 80], {
        method: 'POST',
        url: `${BASE.replace('/api/v1', '')}/webhook/${LEARNING_WEBHOOK_PATH}`,
        jsonBody: `={{ JSON.stringify({ project_id: '${PROJECT_ID}', persona: ${ACT}.action.payload.persona || '${PERSONA}', first_draft: ${ACT}.action.payload.first_draft || '', final_text: ${ACT}.action.payload.draft || '', feedback_log: ${ACT}.action.payload.feedback_log || [] }) }}`,
      }),
      onError: 'continueRegularOutput',
    },
    twilio('WhatsApp: Gesendet', [1800, 80], `=✅ Gesendet an {{ ${ACT}.action.payload.send_target }}.`),
    // ── revise ──
    appHttp('KI: Entwurf überarbeiten', [1140, 300], {
      method: 'POST',
      url: `${APP}/api/agent/llm`,
      jsonBody: `={{ JSON.stringify({ project_id: '${PROJECT_ID}', prompt_key: 'email/revise', persona_path: ${ACT}.action.payload.persona || '${PERSONA}', user: 'URSPRÜNGLICHE KUNDENANFRAGE:\\n' + (${ACT}.action.payload.original_email || '') + '\\n\\nAKTUELLER ENTWURF:\\n' + (${ACT}.action.payload.draft || '') + '\\n\\nFEEDBACK DES INHABERS:\\n' + ${ACT}.text }) }}`,
    }),
    appHttp('Freigabe aktualisieren', [1360, 300], {
      method: 'PATCH',
      url: `${APP}/api/agent/pending`,
      jsonBody: `={{ JSON.stringify({ id: ${ACT}.action.id, project_id: '${PROJECT_ID}', payload: Object.assign({}, ${ACT}.action.payload, { draft: $json.text, feedback_log: (${ACT}.action.payload.feedback_log || []).concat([${ACT}.text]) }) }) }}`,
    }),
    twilio(
      'WhatsApp: Neuer Entwurf',
      [1580, 300],
      "=✏️ Überarbeiteter Entwurf:\n\n{{ $('KI: Entwurf überarbeiten').item.json.text }}\n\n— Antworte SENDEN zum Abschicken, oder gib weiteres Feedback.",
    ),
    // ── adhoc: tool-fähiger Assistent (server-seitige Function-Calling-Schleife) ──
    appHttp('KI: Assistent', [1140, 520], {
      method: 'POST',
      url: `${APP}/api/agent/assistant`,
      jsonBody: `={{ JSON.stringify({ project_id: '${PROJECT_ID}', persona_path: '${PERSONA}', user: ${ACT}.text }) }}`,
    }),
    twilio('WhatsApp: Antwort', [1360, 520], "={{ $('KI: Assistent').item.json.text }}"),
  ],
  connections: {
    ...chain([
      ['WhatsApp eingehend', 'Nachricht lesen'],
      ['Nachricht lesen', 'Offene Freigabe suchen'],
      ['Offene Freigabe suchen', 'Route bestimmen'],
      ['Route bestimmen', 'Route'],
      ['E-Mail senden', 'Freigabe abschließen'],
      ['Freigabe abschließen', 'Lernen anstoßen'],
      ['Lernen anstoßen', 'WhatsApp: Gesendet'],
      ['KI: Entwurf überarbeiten', 'Freigabe aktualisieren'],
      ['Freigabe aktualisieren', 'WhatsApp: Neuer Entwurf'],
      ['KI: Assistent', 'WhatsApp: Antwort'],
    ]),
    Route: {
      main: [
        [{ node: 'E-Mail senden', type: 'main', index: 0 }],
        [{ node: 'KI: Entwurf überarbeiten', type: 'main', index: 0 }],
        [{ node: 'KI: Assistent', type: 'main', index: 0 }],
      ],
    },
  },
  settings: { executionOrder: 'v1', availableInMCP: true },
};

// ═════════════════ Flow 3: Learning Engine ═════════════════
const flow3 = {
  name: 'AXANTILO: Learning Engine',
  nodes: [
    {
      name: 'Lern-Auftrag',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 300] as [number, number],
      parameters: { httpMethod: 'POST', path: LEARNING_WEBHOOK_PATH, options: {} },
    },
    appHttp('KI: Regeln ableiten', [240, 300], {
      method: 'POST',
      url: `${APP}/api/agent/llm`,
      jsonBody: `={{ JSON.stringify({ project_id: $json.body.project_id, prompt_key: 'email/learn', persona_path: $json.body.persona, user: 'ERSTER AI-ENTWURF:\\n' + ($json.body.first_draft || '(keiner)') + '\\n\\nFINAL GESENDETE VERSION:\\n' + ($json.body.final_text || '') + '\\n\\nFEEDBACK-VERLAUF DES INHABERS:\\n' + (($json.body.feedback_log || []).join('\\n---\\n') || '(kein Feedback)') }) }}`,
    }),
    {
      name: 'Regeln parsen',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [480, 300] as [number, number],
      parameters: {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `const body = $('Lern-Auftrag').item.json.body || {};
let company_md = null, persona_md = null, learned = null;
try {
  const parsed = JSON.parse($json.text);
  if (typeof parsed.company_md === 'string' && parsed.company_md.trim()) company_md = parsed.company_md;
  if (typeof parsed.persona_md === 'string' && parsed.persona_md.trim()) persona_md = parsed.persona_md;
  if (typeof parsed.learned === 'string') learned = parsed.learned;
} catch (e) { /* ungültiges JSON -> nichts lernen (fail-safe) */ }
return [{ json: { company_md, persona_md, learned, project_id: body.project_id, persona: body.persona } }];`,
      },
    },
    {
      name: 'Firmenwissen ändern?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [720, 200] as [number, number],
      parameters: {
        conditions: {
          combinator: 'and',
          options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
          conditions: [{ leftValue: '={{ $json.company_md }}', operator: { type: 'string', operation: 'notEmpty' } }],
        },
      },
    },
    appHttp('Firmenwissen aktualisieren', [960, 120], {
      method: 'PUT',
      url: `${APP}/api/workspace`,
      jsonBody: `={{ JSON.stringify({ project_id: $json.project_id, path: 'rules/company_base.md', content: $json.company_md, updated_by: 'learning-engine' }) }}`,
    }),
    {
      name: 'Persona ändern?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [720, 420] as [number, number],
      parameters: {
        conditions: {
          combinator: 'and',
          options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
          conditions: [{ leftValue: '={{ $json.persona_md }}', operator: { type: 'string', operation: 'notEmpty' } }],
        },
      },
    },
    appHttp('Persona aktualisieren', [960, 420], {
      method: 'PUT',
      url: `${APP}/api/workspace`,
      jsonBody: `={{ JSON.stringify({ project_id: $('Regeln parsen').item.json.project_id, path: $('Regeln parsen').item.json.persona, content: $('Regeln parsen').item.json.persona_md, updated_by: 'learning-engine' }) }}`,
    }),
  ],
  connections: {
    ...chain([
      ['Lern-Auftrag', 'KI: Regeln ableiten'],
      ['KI: Regeln ableiten', 'Regeln parsen'],
    ]),
    'Regeln parsen': {
      main: [[
        { node: 'Firmenwissen ändern?', type: 'main', index: 0 },
        { node: 'Persona ändern?', type: 'main', index: 0 },
      ]],
    },
    'Firmenwissen ändern?': { main: [[{ node: 'Firmenwissen aktualisieren', type: 'main', index: 0 }], []] },
    'Persona ändern?': { main: [[{ node: 'Persona aktualisieren', type: 'main', index: 0 }], []] },
  },
  settings: { executionOrder: 'v1', availableInMCP: true },
};

// ═════════════════ Deploy ═════════════════
async function upsertByName(wf: { name: string } & Record<string, unknown>): Promise<string> {
  const list = await n8n<{ data: Array<{ id: string; name: string }> }>(`/workflows?limit=200`);
  const existing = list.data.find((w) => w.name === wf.name);
  if (existing) {
    await n8n(`/workflows/${existing.id}`, { method: 'PUT', body: JSON.stringify(wf) });
    return existing.id;
  }
  const created = await n8n<{ id: string }>(`/workflows`, { method: 'POST', body: JSON.stringify(wf) });
  return created.id;
}

async function main() {
  console.log('MOCK_N8N =', process.env.MOCK_N8N, '| BASE =', BASE);

  await n8n(`/workflows/${FLOW1_ID}`, { method: 'PUT', body: JSON.stringify(flow1) });
  console.log(`FLOW1 updated: ${FLOW1_ID}`);

  const id3 = await upsertByName(flow3);
  console.log(`FLOW3 (Learning Engine): ${id3} — webhook /webhook/${LEARNING_WEBHOOK_PATH}`);

  const id2 = await upsertByName(flow2);
  console.log(`FLOW2 (WhatsApp Steuerkanal): ${id2} — webhook /webhook/${WA_WEBHOOK_PATH}`);

  console.log('\nTwilio-Webhook-URL (in Twilio Console → WhatsApp Sandbox "When a message comes in"):');
  console.log(`  ${BASE.replace('/api/v1', '')}/webhook/${WA_WEBHOOK_PATH}`);
}
main().catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : String(e)); process.exit(1); });
