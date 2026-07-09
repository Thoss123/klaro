/**
 * Node-Map — zentrale „Bedienungsanleitung" für den Workflow-Agent.
 *
 * Single Source of Truth dafür, welche n8n-Nodes Axantilo kennt, wie man sie
 * verdrahtet und welche Bau-Patterns es gibt. Speist:
 *  - swapTargets(): Alias-Erkennung für Heuristik-Edits (ersetzt SWAP_TARGETS)
 *  - formatNodeMapForPrompt(): kompakter Prompt-Block für den Editor-Agent —
 *    es werden NUR die für den aktuellen Workflow relevanten Nodes gerendert,
 *    damit der Prompt konstant klein bleibt, egal wie groß die Map wächst.
 *
 * Sub-Node-Mechanik (Slots, max, attach) bleibt in lib/ai-subnodes.ts —
 * hier stehen nur die kuratierten Beschreibungen und Verdrahtungs-Hinweise.
 */

export type NodeRole = 'trigger' | 'action' | 'ai' | 'flow' | 'data' | 'human';

export interface NodeMapEntry {
  /** Exakter n8n-Typ, z.B. "n8n-nodes-base.gmail". */
  n8nType: string;
  displayName: string;
  /** User-Phrasen, die auf diesen Node zeigen ("mail", "tabelle", …). Reihenfolge = Priorität. */
  aliases: string[];
  role: NodeRole;
  /** Credential ist zentral von Axantilo verwaltet — Nutzer muss nichts einrichten. */
  centralCredential?: boolean;
  /** Nur als Sub-Node an einem AI-Parent nutzbar (Slot), nie im Hauptflow. */
  subNodeSlot?: 'ai_languageModel' | 'ai_memory' | 'ai_tool' | 'ai_outputParser' | 'ai_embedding';
  credentialType?: string;
  /** Typische Operationen als Kurzliste ("message:send"). */
  typicalOps?: string[];
  /**
   * Das Tool liefert dieses Ergebnis SELBST (z.B. Fireflies → "transkript").
   * → KEIN separater KI-/Action-Schritt dafür; als Quelle/Trigger modellieren.
   */
  selfProduces?: string;
  /** Kanonische Einzelverantwortung — ein Node, ein Job. */
  oneJob?: string;
  /** Ein Satz: wie wird der Node korrekt eingebaut/verdrahtet. */
  wiringNote: string;
}

/** Google-Auth läuft zentral: User klickt nur Verbinden → Konto wählen → Bestätigen. */
const GOOGLE_AUTH = 'Auth: 3-Klick-Login über Axantilos zentrale Google-OAuth-App (Verbinden → Konto wählen → Bestätigen) — der User legt KEINEN eigenen OAuth-Client an.';

/** Resend SMTP läuft über Axantilos zentralen Account — Nutzer muss nichts einrichten. */
const RESEND_AUTH = 'Auth: Zentral via Axantilo (Resend SMTP, hello@axantilo.com) — kein Setup für den Nutzer, Credential ist automatisch gesetzt.';

/** Twilio läuft über Axantilos zentralen Account — Nutzer muss nichts einrichten. */
const TWILIO_AUTH = 'Auth: Zentral via Axantilo (Twilio-Konto, Axantilo-Nummer) — kein Setup für den Nutzer, Credential ist automatisch gesetzt.';

export const NODE_MAP: NodeMapEntry[] = [
  // ── Trigger ──────────────────────────────────────────────────────────────
  {
    n8nType: 'n8n-nodes-base.manualTrigger',
    displayName: 'Manual Trigger',
    aliases: ['manuell', 'manual', 'von hand', 'test-start'],
    role: 'trigger',
    wiringNote: 'Standard-Startpunkt zum Testen; Schritt 1 ist immer ein Trigger.',
  },
  {
    n8nType: 'n8n-nodes-base.scheduleTrigger',
    displayName: 'Schedule Trigger',
    aliases: ['schedule', 'zeitplan', 'cron', 'täglich', 'stündlich', 'wöchentlich', 'jeden morgen'],
    role: 'trigger',
    typicalOps: ['rule.interval'],
    wiringNote: 'Startet zeitgesteuert; Intervall in parameters.rule setzen (z.B. täglich 08:00).',
  },
  {
    n8nType: 'n8n-nodes-base.webhook',
    displayName: 'Webhook',
    aliases: ['webhook', 'http-trigger', 'eingehender request'],
    role: 'trigger',
    typicalOps: ['httpMethod', 'path'],
    wiringNote: 'Startet bei eingehendem HTTP-Call; path + httpMethod setzen, Antwortdaten liegen in $json.body.',
  },
  {
    n8nType: 'n8n-nodes-base.gmailTrigger',
    displayName: 'Gmail Trigger',
    aliases: ['neue mail', 'eingehende e-mail', 'mail-eingang', 'gmail trigger'],
    role: 'trigger',
    credentialType: 'gmailOAuth2',
    typicalOps: ['messageReceived'],
    wiringNote: `Startet bei neuer Mail (optional Label-Filter). ${GOOGLE_AUTH}`,
  },
  {
    n8nType: 'n8n-nodes-base.microsoftOutlookTrigger',
    displayName: 'Outlook Trigger',
    aliases: ['outlook trigger', 'neue outlook-mail', 'microsoft mail eingang'],
    role: 'trigger',
    credentialType: 'microsoftOutlookOAuth2Api',
    typicalOps: ['messageReceived'],
    wiringNote: 'Startet bei neuer Outlook-/Microsoft-365-Mail. Auth: OAuth2 über Microsoft-Login.',
  },
  {
    n8nType: 'n8n-nodes-base.googleCalendarTrigger',
    displayName: 'Google Calendar Trigger',
    aliases: ['kalender trigger', 'termin beendet', 'nach dem termin', 'kalender-event', 'meeting beendet'],
    role: 'trigger',
    credentialType: 'googleCalendarOAuth2Api',
    typicalOps: ['triggerOn:eventEnded', 'triggerOn:eventCreated', 'triggerOn:eventStarted'],
    wiringNote: `Startet bei Kalender-Ereignis (z.B. Termin beendet/erstellt); calendarId + triggerOn setzen. ${GOOGLE_AUTH}`,
  },
  {
    n8nType: 'n8n-nodes-base.emailReadImap',
    displayName: 'IMAP E-Mail Trigger',
    aliases: ['imap', 'e-mail abrufen', 'posteingang imap', 'mail-eingang imap'],
    role: 'trigger',
    credentialType: 'imap',
    typicalOps: ['messageReceived'],
    wiringNote: 'Startet bei neuer Mail via IMAP (anbieter-unabhängig); Host/Port/Login als IMAP-Credential.',
  },
  {
    n8nType: 'n8n-nodes-base.formTrigger',
    displayName: 'n8n Form Trigger',
    aliases: ['formular', 'form', 'eingabeformular'],
    role: 'trigger',
    wiringNote: 'Erzeugt ein gehostetes Formular; Felder unter formFields definieren, Werte liegen in $json.',
  },

  // ── Kommunikation / Aktionen ─────────────────────────────────────────────
  {
    n8nType: 'n8n-nodes-base.gmail',
    displayName: 'Gmail',
    aliases: ['gmail', 'e-mail', 'email', 'mail senden', 'mail'],
    role: 'action',
    credentialType: 'gmailOAuth2',
    typicalOps: ['message:send', 'message:getAll', 'message:addLabels'],
    wiringNote: `Mail senden: sendTo/subject/message als Expressions aus Vorschritt. ${GOOGLE_AUTH}`,
  },
  {
    n8nType: 'n8n-nodes-base.slack',
    displayName: 'Slack',
    aliases: ['slack', 'slack-nachricht'],
    role: 'action',
    credentialType: 'slackApi',
    typicalOps: ['message:post'],
    wiringNote: 'Nachricht in Channel posten: select=channel, channelId, text als Expression.',
  },
  {
    n8nType: 'n8n-nodes-base.telegram',
    displayName: 'Telegram',
    aliases: ['telegram'],
    role: 'action',
    credentialType: 'telegramApi',
    typicalOps: ['message:sendMessage'],
    wiringNote: 'Bot-Nachricht: chatId + text; Bot-Token als Credential.',
  },
  {
    n8nType: 'n8n-nodes-base.notion',
    displayName: 'Notion',
    aliases: ['notion'],
    role: 'action',
    credentialType: 'notionApi',
    typicalOps: ['page:create', 'databasePage:create'],
    wiringNote: 'Seite/Datenbankeintrag anlegen: databaseId wählen, Properties als Expressions mappen.',
  },
  {
    n8nType: 'n8n-nodes-base.airtable',
    displayName: 'Airtable',
    aliases: ['airtable'],
    role: 'action',
    credentialType: 'airtableTokenApi',
    typicalOps: ['record:create', 'record:search'],
    wiringNote: 'Record anlegen/suchen: base + table wählen; authentication muss zum Token-Credential passen.',
  },
  {
    n8nType: 'n8n-nodes-base.googleSheets',
    displayName: 'Google Sheets',
    aliases: ['google sheets', 'sheets', 'tabelle', 'spreadsheet'],
    role: 'action',
    credentialType: 'googleSheetsOAuth2Api',
    typicalOps: ['append', 'read', 'update'],
    wiringNote: `Zeile anhängen/lesen: documentId + sheetName, Spalten als Expressions. ${GOOGLE_AUTH}`,
  },
  {
    n8nType: 'n8n-nodes-base.googleDocs',
    displayName: 'Google Docs',
    aliases: ['google docs', 'docs', 'dokument'],
    role: 'action',
    credentialType: 'googleDocsOAuth2Api',
    typicalOps: ['document:create', 'document:update'],
    wiringNote: `Dokument erstellen/befüllen; Inhalt als Expression. ${GOOGLE_AUTH}`,
  },
  {
    n8nType: 'n8n-nodes-base.googleDrive',
    displayName: 'Google Drive',
    aliases: ['google drive', 'drive', 'datei ablegen'],
    role: 'action',
    credentialType: 'googleDriveOAuth2Api',
    typicalOps: ['file:upload', 'folder:create'],
    oneJob: 'Datei ablegen/hochladen — eigener Schritt, nie mit Transkription/KI in einen Node mischen.',
    wiringNote: `Dateien hochladen/ablegen; folderId wählen. EIGENER Schritt (z.B. nach Transkript/KI). ${GOOGLE_AUTH}`,
  },
  {
    n8nType: 'n8n-nodes-base.googleCalendar',
    displayName: 'Google Calendar',
    aliases: ['google calendar', 'kalender', 'termin'],
    role: 'action',
    credentialType: 'googleCalendarOAuth2Api',
    typicalOps: ['event:create', 'event:getAll'],
    wiringNote: `Termine anlegen/lesen: calendar wählen, start/end als Expressions. ${GOOGLE_AUTH}`,
  },
  {
    n8nType: 'n8n-nodes-base.hubspot',
    displayName: 'HubSpot',
    aliases: ['hubspot', 'crm'],
    role: 'action',
    credentialType: 'hubspotApi',
    typicalOps: ['contact:create', 'deal:create'],
    wiringNote: 'Kontakt/Deal anlegen: Pflichtfelder (email) als Expressions mappen.',
  },
  {
    n8nType: 'n8n-nodes-base.httpRequest',
    displayName: 'HTTP Request',
    aliases: ['http', 'api request', 'api-call', 'request', 'rest'],
    role: 'action',
    typicalOps: ['GET', 'POST'],
    wiringNote: 'Beliebige API ansprechen: method + url; Auth über generische Credentials (z.B. httpHeaderAuth); JSON-Antwort liegt direkt in $json.',
  },
  {
    n8nType: 'n8n-nodes-base.facebookGraphApi',
    displayName: 'Facebook Graph API',
    aliases: ['meta', 'facebook', 'instagram'],
    role: 'action',
    credentialType: 'facebookGraphApi',
    wiringNote: 'Meta/Facebook/Instagram über Graph API: edge + node angeben.',
  },
  {
    n8nType: 'n8n-nodes-base.youTube',
    displayName: 'YouTube',
    aliases: ['youtube'],
    role: 'action',
    credentialType: 'youTubeOAuth2Api',
    typicalOps: ['video:upload', 'video:get'],
    wiringNote: `Videos hochladen/abfragen. ${GOOGLE_AUTH}`,
  },

  // ── Daten / Logik ────────────────────────────────────────────────────────
  {
    n8nType: 'n8n-nodes-base.set',
    displayName: 'Edit Fields (Set)',
    aliases: ['set', 'feld setzen', 'daten setzen', 'felder', 'mapping'],
    role: 'data',
    wiringNote: 'Felder umbenennen/zusammenbauen: assignments mit Expressions; ideal vor einem Versand-Schritt.',
  },
  {
    n8nType: 'n8n-nodes-base.code',
    displayName: 'Code',
    aliases: ['code', 'javascript', 'script', 'js'],
    role: 'data',
    typicalOps: ['jsCode'],
    wiringNote: 'JavaScript MUSS in parameters.jsCode; Items über $input.all() lesen, Array von {json:{…}} zurückgeben.',
  },
  {
    n8nType: 'n8n-nodes-base.if',
    displayName: 'If',
    aliases: ['if', 'verzweigung', 'wenn dann', 'bedingung', 'else'],
    role: 'flow',
    typicalOps: ['conditions'],
    wiringNote: 'Bedingungen in parameters.conditions; zwei Ausgänge — Edges mit branch:"true" und branch:"false" verbinden.',
  },
  {
    n8nType: 'n8n-nodes-base.switch',
    displayName: 'Switch',
    aliases: ['switch', 'mehrere fälle', 'mehrere wege', 'routen'],
    role: 'flow',
    wiringNote: 'Mehrfach-Verzweigung: Regeln definieren; Edges mit branch:"switch-0", "switch-1", … pro Ausgang.',
  },
  {
    n8nType: 'n8n-nodes-base.merge',
    displayName: 'Merge',
    aliases: ['merge', 'zusammenführen', 'zusammenfügen'],
    role: 'flow',
    wiringNote: 'Führt Zweige zusammen: eingehende Edges mit targetInput:0 und targetInput:1 unterscheiden.',
  },
  {
    n8nType: 'n8n-nodes-base.wait',
    displayName: 'Wait',
    aliases: ['warten', 'wait', 'pause', 'verzögerung'],
    role: 'flow',
    wiringNote: 'Pausiert den Workflow (Zeit oder bis Webhook-Resume) — Basis für Freigabe-Schleifen.',
  },

  // ── KI: Hauptflow-Nodes ──────────────────────────────────────────────────
  {
    n8nType: '@n8n/n8n-nodes-langchain.agent',
    displayName: 'AI Agent',
    aliases: ['ai agent', 'ki-agent', 'agent'],
    role: 'ai',
    typicalOps: ['promptType', 'text'],
    oneJob: 'OFFENE Aufgabe: selbst entscheiden, Tools nutzen, mehrstufig/iterativ.',
    wiringNote: 'NUR für offene Aufgaben (Tools nutzen, entscheiden, mehrstufig). Feste Einzelaufgabe (zusammenfassen/klassifizieren/extrahieren/aus Vorlage) → Basic LLM Chain. Braucht ZWINGEND ein Chat Model als Sub-Node (ai_languageModel), optional Memory/Tools. Default-Chat-Model = „Axantilo Chat Model" (lmChatOpenAi @ Axantilo-Proxy, zentral, kein Nutzer-Zugang nötig).',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.chainLlm',
    displayName: 'Basic LLM Chain',
    aliases: ['llm chain', 'prompt-kette', 'einfacher prompt', 'text generieren', 'umformulieren', 'aus vorlage'],
    role: 'ai',
    oneJob: 'FESTE Einzelaufgabe: ein Prompt rein, ein Ergebnis raus — keine Tools, deterministisch.',
    wiringNote: 'Default für feste KI-Aufgaben (generieren/umformulieren/Text aus Vorlage). Günstiger & verlässlicher als Agent, wenn keine Tools/Entscheidungen nötig. Braucht ein Chat Model als Sub-Node (ai_languageModel). Default-Chat-Model = „Axantilo Chat Model" (lmChatOpenAi @ Axantilo-Proxy, zentral, kein Nutzer-Zugang nötig).',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.chainSummarization',
    displayName: 'Summarization Chain',
    aliases: ['zusammenfassen', 'summarize', 'zusammenfassung'],
    role: 'ai',
    wiringNote: 'Fasst Eingangstext zusammen; braucht ein Chat Model als Sub-Node (ai_languageModel). Default-Chat-Model = „Axantilo Chat Model" (lmChatOpenAi @ Axantilo-Proxy, zentral, kein Nutzer-Zugang nötig).',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.openAi',
    displayName: 'OpenAI',
    aliases: ['openai', 'gpt', 'chatgpt', 'ki'],
    role: 'ai',
    credentialType: 'openAiApi',
    typicalOps: ['text:message', 'image:generate'],
    wiringNote: 'Einziger KI-Node, der direkt im Hauptflow stehen darf (eigene message-Operation, ohne Sub-Node).',
  },

  // ── KI: Sub-Node-only (Chat Models / Memory / Tools) ─────────────────────
  {
    n8nType: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
    displayName: 'OpenAI Chat Model',
    aliases: ['openai chat model', 'gpt-modell'],
    role: 'ai',
    subNodeSlot: 'ai_languageModel',
    credentialType: 'openAiApi',
    wiringNote: 'NUR als Sub-Node an Agent/Chain (slot ai_languageModel) — nie im Hauptflow. Default-Auswahl von Axantilo = „Axantilo Chat Model": zeigt über eine openAiApi-Credential mit custom Base-URL auf Axantilos eigenen, gemeterten Mistral-Proxy (tool: axantilo_ai, zentral pro Projekt provisioniert via ensureAxantiloLlmCredential — kein Nutzer-Zugang nötig). Nur bei einer ECHTEN, vom Nutzer verbundenen OpenAI-Credential zeigt der Node auf die echte OpenAI-API.',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.lmChatMistralCloud',
    displayName: 'Mistral Cloud Chat Model',
    aliases: ['mistral'],
    role: 'ai',
    subNodeSlot: 'ai_languageModel',
    credentialType: 'mistralCloudApi',
    wiringNote: 'NUR als Sub-Node (ai_languageModel); Modellwahl über parameters.model (z.B. "mistral-large-latest"). Kein Axantilo-Default mehr (siehe lmChatOpenAi) — braucht eine eigene mistralCloudApi-Credential des Nutzers, falls explizit gewünscht.',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
    displayName: 'Anthropic Chat Model',
    aliases: ['anthropic', 'claude'],
    role: 'ai',
    subNodeSlot: 'ai_languageModel',
    credentialType: 'anthropicApi',
    wiringNote: 'NUR als Sub-Node (ai_languageModel) an Agent/Chain.',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
    displayName: 'Google Gemini Chat Model',
    aliases: ['gemini'],
    role: 'ai',
    subNodeSlot: 'ai_languageModel',
    credentialType: 'googlePalmApi',
    wiringNote: 'NUR als Sub-Node (ai_languageModel) an Agent/Chain.',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
    displayName: 'Window Buffer Memory',
    aliases: ['memory', 'gedächtnis', 'verlauf merken'],
    role: 'ai',
    subNodeSlot: 'ai_memory',
    wiringNote: 'NUR als Sub-Node (ai_memory) am Agent — merkt sich die letzten Nachrichten.',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.toolHttpRequest',
    displayName: 'HTTP Request Tool',
    aliases: ['http tool', 'api tool'],
    role: 'ai',
    subNodeSlot: 'ai_tool',
    wiringNote: 'NUR als Sub-Node (ai_tool) am Agent — gibt dem Agent eine API als Werkzeug.',
  },

  // ── KI: weitere Hauptflow-Nodes & Trigger ────────────────────────────────
  {
    n8nType: '@n8n/n8n-nodes-langchain.chatTrigger',
    displayName: 'Chat Trigger',
    aliases: ['chatbot', 'chat', 'webchat'],
    role: 'trigger',
    wiringNote: 'Startet bei Chat-Nachricht (gehostetes Widget); mit AI Agent kombinieren, responseMode "streaming" bevorzugen.',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.informationExtractor',
    displayName: 'Information Extractor',
    aliases: ['informationen extrahieren', 'daten extrahieren', 'extrahieren'],
    role: 'ai',
    wiringNote: 'Zieht strukturierte Felder aus Text (Schema definieren); braucht ein Chat Model als Sub-Node (ai_languageModel).',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.textClassifier',
    displayName: 'Text Classifier',
    aliases: ['klassifizieren', 'kategorisieren', 'klassifizierung'],
    role: 'ai',
    wiringNote: 'Sortiert Text in Kategorien; pro Kategorie ein eigener Ausgang (branch wie bei Switch); braucht Chat Model als Sub-Node (ai_languageModel).',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.sentimentAnalysis',
    displayName: 'Sentiment Analysis',
    aliases: ['sentiment', 'stimmung', 'tonalität'],
    role: 'ai',
    wiringNote: 'Bewertet Stimmung (positiv/neutral/negativ) mit eigenem Ausgang je Kategorie; braucht Chat Model als Sub-Node (ai_languageModel).',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.googleGemini',
    displayName: 'Google Gemini',
    aliases: ['gemini api'],
    role: 'ai',
    credentialType: 'googlePalmApi',
    typicalOps: ['text:message', 'image:analyze'],
    wiringNote: 'Direkter Gemini-Node im Hauptflow (Text/Bild/Video) — per API-Key, kein OAuth.',
  },

  // ── KI: weitere Sub-Node-only ────────────────────────────────────────────
  {
    n8nType: '@n8n/n8n-nodes-langchain.lmChatOpenRouter',
    displayName: 'OpenRouter Chat Model',
    aliases: ['openrouter'],
    role: 'ai',
    subNodeSlot: 'ai_languageModel',
    credentialType: 'openRouterApi',
    wiringNote: 'NUR als Sub-Node (ai_languageModel) — Zugriff auf viele Modelle über einen Anbieter.',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.lmChatGroq',
    displayName: 'Groq Chat Model',
    aliases: ['groq'],
    role: 'ai',
    subNodeSlot: 'ai_languageModel',
    credentialType: 'groqApi',
    wiringNote: 'NUR als Sub-Node (ai_languageModel) — sehr schnelle Open-Source-Modelle.',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.lmChatAzureOpenAi',
    displayName: 'Azure OpenAI Chat Model',
    aliases: ['azure openai', 'azure'],
    role: 'ai',
    subNodeSlot: 'ai_languageModel',
    credentialType: 'azureOpenAiApi',
    wiringNote: 'NUR als Sub-Node (ai_languageModel) — OpenAI-Modelle über Azure (EU-Hosting möglich).',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.lmChatCohere',
    displayName: 'Cohere Chat Model',
    aliases: ['cohere'],
    role: 'ai',
    subNodeSlot: 'ai_languageModel',
    credentialType: 'cohereApi',
    wiringNote: 'NUR als Sub-Node (ai_languageModel) an Agent/Chain.',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.memoryPostgresChat',
    displayName: 'Postgres Chat Memory',
    aliases: ['postgres memory', 'dauerhaftes gedächtnis'],
    role: 'ai',
    subNodeSlot: 'ai_memory',
    credentialType: 'postgres',
    wiringNote: 'NUR als Sub-Node (ai_memory) — persistenter Chat-Verlauf in Postgres statt nur im Speicher.',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.toolCode',
    displayName: 'Code Tool',
    aliases: ['code tool'],
    role: 'ai',
    subNodeSlot: 'ai_tool',
    wiringNote: 'NUR als Sub-Node (ai_tool) — eigenes JS/Python-Werkzeug für den Agent.',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.toolWorkflow',
    displayName: 'Call n8n Workflow Tool',
    aliases: ['workflow tool', 'sub-workflow tool'],
    role: 'ai',
    subNodeSlot: 'ai_tool',
    wiringNote: 'NUR als Sub-Node (ai_tool) — macht einen anderen n8n-Workflow zum Agent-Werkzeug.',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.outputParserStructured',
    displayName: 'Structured Output Parser',
    aliases: ['output parser', 'json-format erzwingen', 'strukturierte ausgabe'],
    role: 'ai',
    subNodeSlot: 'ai_outputParser',
    wiringNote: 'NUR als Sub-Node (ai_outputParser) — erzwingt definiertes JSON; Ergebnis liegt unter $json.output.',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.embeddingsOpenAi',
    displayName: 'Embeddings OpenAI',
    aliases: ['embeddings'],
    role: 'ai',
    subNodeSlot: 'ai_embedding',
    credentialType: 'openAiApi',
    wiringNote: 'NUR als Sub-Node (ai_embedding) an einem Vector Store.',
  },
  {
    n8nType: '@n8n/n8n-nodes-langchain.vectorStorePGVector',
    displayName: 'Postgres PGVector Store',
    aliases: ['vector store', 'vektordatenbank', 'pgvector'],
    role: 'ai',
    subNodeSlot: 'ai_tool',
    credentialType: 'postgres',
    wiringNote: 'NUR als Sub-Node (ai_tool am Agent für Wissensabfrage) — braucht selbst ein Embeddings-Sub-Node.',
  },

  // ── Senden & Kommunikation (weitere) ─────────────────────────────────────
  {
    n8nType: 'n8n-nodes-base.microsoftOutlook',
    displayName: 'Microsoft Outlook',
    aliases: ['outlook', 'microsoft mail', 'office 365 mail'],
    role: 'action',
    credentialType: 'microsoftOutlookOAuth2Api',
    typicalOps: ['message:send', 'message:getAll', 'message:sendAndWait'],
    wiringNote: 'Mail über Microsoft 365 senden/lesen; OAuth-Login mit dem Microsoft-Konto.',
  },
  {
    n8nType: 'n8n-nodes-base.emailSend',
    displayName: 'Send Email (SMTP)',
    aliases: ['smtp', 'mail versenden smtp', 'resend', 'transaktions-mail', 'system-mail'],
    role: 'action',
    credentialType: 'smtp',
    centralCredential: true,
    typicalOps: ['send', 'sendAndWait'],
    wiringNote: `Transaktions-Mails via Axantilo-Domain (hello@axantilo.com). fromEmail/toEmail/subject/text als Expressions. ${RESEND_AUTH}`,
  },
  {
    n8nType: 'n8n-nodes-base.whatsApp',
    displayName: 'WhatsApp Business Cloud',
    aliases: ['whatsapp'],
    role: 'action',
    credentialType: 'whatsAppApi',
    centralCredential: true,
    typicalOps: ['message:send', 'message:sendAndWait'],
    wiringNote: `WhatsApp-Nachricht senden; to (Empfänger-Nummer +49…) und message setzen. ${TWILIO_AUTH}`,
  },
  {
    n8nType: 'n8n-nodes-base.twilio',
    displayName: 'Twilio',
    aliases: ['twilio', 'sms'],
    role: 'action',
    credentialType: 'twilioApi',
    centralCredential: true,
    typicalOps: ['sms:send', 'call:make'],
    wiringNote: `SMS versenden; to (Empfänger +49…) und body als Expressions. ${TWILIO_AUTH}`,
  },
  {
    n8nType: 'n8n-nodes-base.discord',
    displayName: 'Discord',
    aliases: ['discord'],
    role: 'action',
    typicalOps: ['message:send', 'message:sendAndWait'],
    wiringNote: 'Nachricht in Discord-Channel (Bot oder Webhook); Server + Channel wählen.',
  },
  {
    n8nType: 'n8n-nodes-base.microsoftTeams',
    displayName: 'Microsoft Teams',
    aliases: ['teams', 'ms teams', 'microsoft teams'],
    role: 'action',
    credentialType: 'microsoftTeamsOAuth2Api',
    typicalOps: ['chatMessage:create', 'chatMessage:sendAndWait'],
    wiringNote: 'Nachricht in Teams-Channel/Chat; OAuth-Login mit Microsoft-Konto.',
  },
  {
    n8nType: 'n8n-nodes-base.sendGrid',
    displayName: 'SendGrid',
    aliases: ['sendgrid'],
    role: 'action',
    credentialType: 'sendGridApi',
    typicalOps: ['mail:send'],
    wiringNote: 'Transaktionale Mails in großem Volumen; verifizierte Absender-Domain nötig.',
  },
  {
    n8nType: 'n8n-nodes-base.sendInBlue',
    displayName: 'Brevo (Sendinblue)',
    aliases: ['brevo', 'sendinblue', 'newsletter'],
    role: 'action',
    credentialType: 'sendInBlueApi',
    typicalOps: ['email:send', 'contact:create'],
    wiringNote: 'Newsletter/Marketing-Mails + Kontaktverwaltung; EU-Anbieter (DSGVO-freundlich).',
  },
  {
    n8nType: 'n8n-nodes-base.mailchimp',
    displayName: 'Mailchimp',
    aliases: ['mailchimp'],
    role: 'action',
    credentialType: 'mailchimpApi',
    typicalOps: ['member:create', 'campaign:send'],
    wiringNote: 'Kontakte in Listen/Audiences pflegen und Kampagnen steuern.',
  },

  // ── Internet-Recherche ───────────────────────────────────────────────────
  {
    n8nType: 'n8n-nodes-base.perplexity',
    displayName: 'Perplexity',
    aliases: ['perplexity', 'websuche', 'web search', 'internet-recherche', 'recherche'],
    role: 'ai',
    credentialType: 'perplexityApi',
    typicalOps: ['chat:complete', 'search:search'],
    wiringNote: 'KI-Websuche mit aktuellen Quellen — chat:complete für Antworten mit Zitaten, search für rohe Treffer.',
  },
  {
    n8nType: 'n8n-nodes-base.rssFeedRead',
    displayName: 'RSS Read',
    aliases: ['rss', 'feed', 'news abrufen'],
    role: 'action',
    typicalOps: ['feedUrl'],
    wiringNote: 'Liest RSS-Feeds (Blogs/News); pro Feed-Eintrag ein Item — gut mit Schedule Trigger kombinieren.',
  },
  {
    n8nType: 'n8n-nodes-base.html',
    displayName: 'HTML',
    aliases: ['webseite auslesen', 'scraping', 'scrape', 'html extrahieren'],
    role: 'data',
    typicalOps: ['extractHtmlContent', 'generateHtmlTemplate'],
    wiringNote: 'Extrahiert Inhalte per CSS-Selektor aus HTML — Kombination: HTTP Request lädt die Seite, HTML parst sie.',
  },

  // ── Ads & Marketing-Plattformen ──────────────────────────────────────────
  {
    n8nType: 'n8n-nodes-base.googleAds',
    displayName: 'Google Ads',
    aliases: ['google ads', 'adwords'],
    role: 'action',
    credentialType: 'googleAdsOAuth2Api',
    typicalOps: ['campaign:getAll'],
    wiringNote: `Kampagnen-Daten abrufen (Reporting); braucht zusätzlich einen Developer-Token. ${GOOGLE_AUTH}`,
  },
  {
    n8nType: 'n8n-nodes-base.googleAnalytics',
    displayName: 'Google Analytics',
    aliases: ['google analytics', 'analytics', 'ga4'],
    role: 'action',
    credentialType: 'googleAnalyticsOAuth2',
    typicalOps: ['report:get'],
    wiringNote: `GA4-Reports abrufen (Besucher, Conversions) — gut für automatische Wochen-Reports. ${GOOGLE_AUTH}`,
  },
  {
    n8nType: 'n8n-nodes-base.facebookLeadAdsTrigger',
    displayName: 'Facebook Lead Ads Trigger',
    aliases: ['lead ads', 'facebook leads', 'meta leads'],
    role: 'trigger',
    credentialType: 'facebookLeadAdsOAuth2Api',
    wiringNote: 'Startet bei neuem Lead aus Meta/Facebook Lead-Formularen — Standard-Start für Lead-Follow-up.',
  },
  {
    n8nType: 'n8n-nodes-base.googleBusinessProfile',
    displayName: 'Google Business Profile',
    aliases: ['google business', 'google rezensionen', 'google reviews'],
    role: 'action',
    credentialType: 'googleBusinessProfileOAuth2Api',
    typicalOps: ['review:getAll', 'review:reply'],
    wiringNote: `Rezensionen abrufen/beantworten — z.B. KI-gestützte Review-Antworten. ${GOOGLE_AUTH}`,
  },
  {
    n8nType: 'n8n-nodes-base.linkedIn',
    displayName: 'LinkedIn',
    aliases: ['linkedin'],
    role: 'action',
    credentialType: 'linkedInOAuth2Api',
    typicalOps: ['post:create'],
    wiringNote: 'Posts auf LinkedIn veröffentlichen (Person oder Unternehmensseite).',
  },

  // ── Branchensoftware: CRM / Sales ────────────────────────────────────────
  {
    n8nType: 'n8n-nodes-base.pipedrive',
    displayName: 'Pipedrive',
    aliases: ['pipedrive'],
    role: 'action',
    credentialType: 'pipedriveApi',
    typicalOps: ['deal:create', 'person:create'],
    wiringNote: 'Deals/Personen im Vertriebs-CRM anlegen und aktualisieren.',
  },
  {
    n8nType: 'n8n-nodes-base.salesforce',
    displayName: 'Salesforce',
    aliases: ['salesforce'],
    role: 'action',
    credentialType: 'salesforceOAuth2Api',
    typicalOps: ['lead:create', 'contact:upsert', 'opportunity:create'],
    wiringNote: 'Leads/Kontakte/Opportunities verwalten; upsert vermeidet Duplikate.',
  },
  {
    n8nType: 'n8n-nodes-base.zohoCrm',
    displayName: 'Zoho CRM',
    aliases: ['zoho'],
    role: 'action',
    credentialType: 'zohoOAuth2Api',
    typicalOps: ['lead:create', 'contact:create'],
    wiringNote: 'Leads/Kontakte im Zoho CRM verwalten.',
  },
  {
    n8nType: 'n8n-nodes-base.activeCampaign',
    displayName: 'ActiveCampaign',
    aliases: ['activecampaign', 'marketing automation'],
    role: 'action',
    credentialType: 'activeCampaignApi',
    typicalOps: ['contact:create', 'contactTag:add'],
    wiringNote: 'Kontakte + Tags für E-Mail-Automationen pflegen; Tags triggern dort Kampagnen.',
  },

  // ── Branchensoftware: Support / E-Commerce / Zahlungen ───────────────────
  {
    n8nType: 'n8n-nodes-base.zendesk',
    displayName: 'Zendesk',
    aliases: ['zendesk'],
    role: 'action',
    credentialType: 'zendeskApi',
    typicalOps: ['ticket:create', 'ticket:update'],
    wiringNote: 'Support-Tickets anlegen/aktualisieren — z.B. aus eingehenden Mails oder Formularen.',
  },
  {
    n8nType: 'n8n-nodes-base.shopify',
    displayName: 'Shopify',
    aliases: ['shopify'],
    role: 'action',
    credentialType: 'shopifyApi',
    typicalOps: ['order:getAll', 'product:update'],
    wiringNote: 'Bestellungen/Produkte des Shops verwalten; für Echtzeit auf Bestellungen den Shopify Trigger nutzen.',
  },
  {
    n8nType: 'n8n-nodes-base.wooCommerce',
    displayName: 'WooCommerce',
    aliases: ['woocommerce'],
    role: 'action',
    credentialType: 'wooCommerceApi',
    typicalOps: ['order:getAll', 'product:update'],
    wiringNote: 'WordPress-Shop: Bestellungen/Produkte per REST-API verwalten.',
  },
  {
    n8nType: 'n8n-nodes-base.stripe',
    displayName: 'Stripe',
    aliases: ['stripe'],
    role: 'action',
    credentialType: 'stripeApi',
    typicalOps: ['customer:create', 'charge:getAll'],
    wiringNote: 'Zahlungsdaten/Kunden abrufen; für „bei neuer Zahlung" den Stripe Trigger (Webhook) nutzen.',
  },
  {
    n8nType: 'n8n-nodes-base.payPal',
    displayName: 'PayPal',
    aliases: ['paypal'],
    role: 'action',
    credentialType: 'payPalApi',
    typicalOps: ['payout:create'],
    wiringNote: 'Auszahlungen erstellen; für eingehende Zahlungen den PayPal Trigger nutzen.',
  },

  // ── Branchensoftware: Projekte / Termine / Formulare / Web ───────────────
  {
    n8nType: 'n8n-nodes-base.jira',
    displayName: 'Jira Software',
    aliases: ['jira'],
    role: 'action',
    credentialType: 'jiraSoftwareCloudApi',
    typicalOps: ['issue:create', 'issue:update'],
    wiringNote: 'Issues/Tickets in Jira anlegen und aktualisieren.',
  },
  {
    n8nType: 'n8n-nodes-base.asana',
    displayName: 'Asana',
    aliases: ['asana'],
    role: 'action',
    credentialType: 'asanaApi',
    typicalOps: ['task:create'],
    wiringNote: 'Aufgaben in Asana-Projekten anlegen; workspace + projects setzen.',
  },
  {
    n8nType: 'n8n-nodes-base.trello',
    displayName: 'Trello',
    aliases: ['trello'],
    role: 'action',
    credentialType: 'trelloApi',
    typicalOps: ['card:create'],
    wiringNote: 'Karten auf Boards/Listen anlegen — leichtgewichtige Aufgabenverwaltung.',
  },
  {
    n8nType: 'n8n-nodes-base.mondayCom',
    displayName: 'Monday.com',
    aliases: ['monday'],
    role: 'action',
    credentialType: 'mondayComApi',
    typicalOps: ['boardItem:create'],
    wiringNote: 'Items auf Monday-Boards anlegen/ändern; Spaltenwerte als JSON.',
  },
  {
    n8nType: 'n8n-nodes-base.clickUp',
    displayName: 'ClickUp',
    aliases: ['clickup'],
    role: 'action',
    credentialType: 'clickUpApi',
    typicalOps: ['task:create'],
    wiringNote: 'Aufgaben in ClickUp-Listen anlegen und aktualisieren.',
  },
  {
    n8nType: 'n8n-nodes-base.zoom',
    displayName: 'Zoom',
    aliases: ['zoom'],
    role: 'action',
    credentialType: 'zoomOAuth2Api',
    typicalOps: ['meeting:create'],
    wiringNote: 'Meetings anlegen/verwalten — z.B. automatisch nach Terminbuchung.',
  },
  {
    n8nType: 'n8n-nodes-base.calendlyTrigger',
    displayName: 'Calendly Trigger',
    aliases: ['calendly', 'terminbuchung'],
    role: 'trigger',
    credentialType: 'calendlyApi',
    wiringNote: 'Startet bei neuer/stornierter Terminbuchung — Standard-Start für Termin-Follow-ups.',
  },
  {
    n8nType: 'n8n-nodes-base.typeformTrigger',
    displayName: 'Typeform Trigger',
    aliases: ['typeform'],
    role: 'trigger',
    credentialType: 'typeformApi',
    wiringNote: 'Startet bei neuer Formular-Antwort; Antwortfelder liegen in $json.',
  },
  {
    n8nType: 'n8n-nodes-base.jotFormTrigger',
    displayName: 'JotForm Trigger',
    aliases: ['jotform'],
    role: 'trigger',
    credentialType: 'jotFormApi',
    wiringNote: 'Startet bei neuer JotForm-Einsendung.',
  },
  {
    n8nType: 'n8n-nodes-base.wordpress',
    displayName: 'WordPress',
    aliases: ['wordpress', 'blog'],
    role: 'action',
    credentialType: 'wordpressApi',
    typicalOps: ['post:create'],
    wiringNote: 'Blog-Beiträge anlegen/aktualisieren (z.B. KI-generierte Entwürfe als draft).',
  },
  {
    n8nType: 'n8n-nodes-base.postgres',
    displayName: 'Postgres',
    aliases: ['postgres', 'postgresql', 'datenbank', 'sql'],
    role: 'action',
    credentialType: 'postgres',
    typicalOps: ['insert', 'select', 'executeQuery'],
    wiringNote: 'Direkt in die Datenbank schreiben/lesen; Parameter statt String-Konkatenation für Werte nutzen.',
  },

  // ── Core: Daten-Utilities ────────────────────────────────────────────────
  {
    n8nType: 'n8n-nodes-base.filter',
    displayName: 'Filter',
    aliases: ['filter', 'filtern', 'aussortieren'],
    role: 'flow',
    wiringNote: 'Lässt nur passende Items durch; bei 0 Treffern stoppt der Strang sauber — kein IF davor nötig.',
  },
  {
    n8nType: 'n8n-nodes-base.splitInBatches',
    displayName: 'Loop Over Items',
    aliases: ['loop', 'schleife', 'batch', 'einzeln verarbeiten'],
    role: 'flow',
    wiringNote: 'Schleife: loop-Ausgang → Verarbeitung → Edge ZURÜCK zum Loop-Node; done-Ausgang feuert nach dem letzten Item.',
  },
  {
    n8nType: 'n8n-nodes-base.splitOut',
    displayName: 'Split Out',
    aliases: ['split out', 'liste aufteilen', 'array aufteilen'],
    role: 'data',
    wiringNote: 'Macht aus einer Liste in einem Item einzelne Items (Gegenstück: Aggregate).',
  },
  {
    n8nType: 'n8n-nodes-base.aggregate',
    displayName: 'Aggregate',
    aliases: ['aggregieren', 'zusammenfassen zu liste', 'sammeln'],
    role: 'data',
    wiringNote: 'Fasst viele Items zu einem Item mit Liste zusammen (für Zweige stattdessen Merge).',
  },
  {
    n8nType: 'n8n-nodes-base.sort',
    displayName: 'Sort',
    aliases: ['sortieren'],
    role: 'data',
    wiringNote: 'Sortiert Items nach Feldwerten (auf-/absteigend).',
  },
  {
    n8nType: 'n8n-nodes-base.limit',
    displayName: 'Limit',
    aliases: ['begrenzen', 'nur die ersten'],
    role: 'data',
    wiringNote: 'Begrenzt die Item-Anzahl (z.B. Top 5 nach einem Sort).',
  },
  {
    n8nType: 'n8n-nodes-base.removeDuplicates',
    displayName: 'Remove Duplicates',
    aliases: ['duplikate entfernen', 'dedupe', 'doppelte'],
    role: 'data',
    wiringNote: 'Entfernt Duplikate — auch über Ausführungen hinweg („schon gesehen"-Modus für Feeds/Polling).',
  },
  {
    n8nType: 'n8n-nodes-base.dateTime',
    displayName: 'Date & Time',
    aliases: ['datum', 'uhrzeit', 'datum formatieren'],
    role: 'data',
    wiringNote: 'Datumswerte formatieren/addieren/runden — statt Datums-Logik im Code-Node.',
  },
  {
    n8nType: 'n8n-nodes-base.markdown',
    displayName: 'Markdown',
    aliases: ['markdown'],
    role: 'data',
    wiringNote: 'Konvertiert Markdown ↔ HTML (z.B. KI-Text als HTML-Mail versenden).',
  },
  {
    n8nType: 'n8n-nodes-base.extractFromFile',
    displayName: 'Extract from File',
    aliases: ['datei auslesen', 'pdf auslesen', 'csv einlesen'],
    role: 'data',
    wiringNote: 'Macht aus Binärdateien (PDF/CSV/XLSX) JSON-Items — z.B. Mail-Anhang auslesen.',
  },
  {
    n8nType: 'n8n-nodes-base.convertToFile',
    displayName: 'Convert to File',
    aliases: ['als datei', 'csv erzeugen', 'excel erzeugen'],
    role: 'data',
    wiringNote: 'Macht aus JSON-Items eine Datei (CSV/XLSX/JSON) — z.B. als Mail-Anhang oder Drive-Upload.',
  },

  // ── Core: Ablauf-Steuerung ───────────────────────────────────────────────
  {
    n8nType: 'n8n-nodes-base.respondToWebhook',
    displayName: 'Respond to Webhook',
    aliases: ['webhook antworten', 'response senden'],
    role: 'action',
    wiringNote: 'Sendet die HTTP-Antwort des Webhooks; funktioniert nur, wenn der Webhook responseMode="responseNode" hat.',
  },
  {
    n8nType: 'n8n-nodes-base.executeWorkflow',
    displayName: 'Execute Sub-workflow',
    aliases: ['sub-workflow', 'anderen workflow aufrufen', 'unterworkflow'],
    role: 'action',
    wiringNote: 'Ruft einen anderen Workflow auf; der Sub-Workflow startet mit einem Execute-Workflow-Trigger.',
  },
  {
    n8nType: 'n8n-nodes-base.executeWorkflowTrigger',
    displayName: 'Execute Workflow Trigger',
    aliases: ['workflow-aufruf empfangen'],
    role: 'trigger',
    wiringNote: 'Startpunkt eines Sub-Workflows, der von Execute Sub-workflow aufgerufen wird.',
  },
  {
    n8nType: 'n8n-nodes-base.errorTrigger',
    displayName: 'Error Trigger',
    aliases: ['fehler-trigger', 'error workflow'],
    role: 'trigger',
    wiringNote: 'Startet einen separaten Fehler-Workflow, wenn ein anderer Workflow fehlschlägt (z.B. Slack-Alarm).',
  },
  {
    n8nType: 'n8n-nodes-base.stopAndError',
    displayName: 'Stop and Error',
    aliases: ['abbrechen', 'fehler werfen'],
    role: 'flow',
    wiringNote: 'Bricht den Workflow gezielt mit Fehlermeldung ab (z.B. bei ungültigen Eingangsdaten).',
  },
];

export interface WiringPattern {
  name: string;
  /** Wann das Pattern passt. */
  wann: string;
  /** Wie es gebaut wird (Nodes + Edges), in 2–4 Zeilen. */
  bau: string;
}

export const WIRING_PATTERNS: WiringPattern[] = [
  {
    name: 'AI-Agent-Kette',
    wann: 'KI soll Text generieren, entscheiden oder Tools nutzen.',
    bau: 'Agent (@n8n/n8n-nodes-langchain.agent) in den Hauptflow. Chat Model als steps-Eintrag MIT subNodeOf:{parentId,slot:"ai_languageModel"} + Edge {source:model,target:agent,connectionType:"ai_languageModel"}. Memory/Tools analog (ai_memory/ai_tool). Chat Models NIE direkt zwischen zwei Hauptschritte hängen.',
  },
  {
    name: 'Verzweigung & Merge',
    wann: 'Unterschiedliche Wege je nach Bedingung, danach wieder ein Strang.',
    bau: 'IF nach dem Prüfschritt; Edge branch:"true" → Ja-Zweig, branch:"false" → Nein-Zweig. Wieder zusammenführen mit Merge: Edges der Zweige bekommen targetInput:0 bzw. targetInput:1. Bei >2 Fällen Switch mit branch:"switch-0/1/2".',
  },
  {
    name: 'Human-in-the-Loop (Freigabe mit Rückschleife)',
    wann: 'Ein Mensch soll prüfen/freigeben, bevor es weitergeht (z.B. Mail-/Angebots-Entwurf).',
    bau: 'sendAndWait-Operation (Gmail/Slack/Outlook/Teams/Discord/WhatsApp) sendet den Entwurf an den Verantwortlichen und pausiert bis zur Antwort → IF wertet aus: branch:"true" (Freigabe) → Aktion ausführen; branch:"false" (Ablehnung) → Edge ZURÜCK zum Erzeuger-Schritt (mit Feedback überarbeiten), dann erneut zur Freigabe. NIE ein blanker IF ohne Senden/Warten.',
  },
  {
    name: 'Eine Node = eine Aufgabe',
    wann: 'Immer beim Entwerfen der Schritte.',
    bau: 'Jeder Schritt macht genau EINE Sache. Tool, das sein Ergebnis selbst liefert (Fireflies/Otter = Transkript), ist die Quelle/der Trigger — nicht „transkribieren". Folgeaktionen (zusammenfassen, in Drive speichern, mailen) sind je ein eigener Node.',
  },
  {
    name: 'KI: Chain vs. Agent',
    wann: 'Sobald ein KI-Schritt geplant wird.',
    bau: 'Feste Einzelaufgabe (zusammenfassen/klassifizieren/extrahieren/Text aus Vorlage) → Basic LLM Chain (chainLlm) bzw. Spezial-Chain (Summarization/InformationExtractor/TextClassifier). Offene Aufgabe (Tools, Entscheidungen, mehrstufig) → AI Agent. Beide brauchen ihr EIGENES Chat Model als Sub-Node.',
  },
  {
    name: 'Internet-Recherche',
    wann: 'Aktuelle Infos aus dem Web (Markt, News, Konkurrenz) beschaffen.',
    bau: 'KI-Suche mit Quellen: Perplexity (chat:complete). News-Feeds: RSS Read + Remove Duplicates („schon gesehen"). Konkrete Seite: HTTP Request lädt die URL → HTML-Node extrahiert per CSS-Selektor. Agent soll selbst suchen: Perplexity/HTTP als ai_tool-Sub-Node anhängen.',
  },
  {
    name: 'Loop über viele Items',
    wann: 'Items müssen einzeln/gedrosselt verarbeitet werden (API-Limits, Mails pro Empfänger).',
    bau: 'Loop Over Items (splitInBatches): loop-Ausgang → Verarbeitungsschritte → Edge ZURÜCK zum Loop-Node; der done-Ausgang führt weiter, wenn alle Items fertig sind. Kein IF davor nötig (no-op bei leerem Input).',
  },
  {
    name: 'HTTP + Verarbeiten',
    wann: 'Externe API ohne fertigen n8n-Node.',
    bau: 'HTTP Request (method/url, Auth z.B. httpHeaderAuth) → Antwort liegt als JSON in $json → mit Set die benötigten Felder mappen oder mit Code transformieren.',
  },
  {
    name: 'Expressions (Datenfluss)',
    wann: 'Immer, wenn ein Feld dynamische Daten aus Vorschritten braucht.',
    bau: 'Wert mit führendem "=" schreiben: "={{ $json.feld }}". Daten eines bestimmten Schritts: "={{ $(\'Node Name\').item.json.feld }}". Statische Texte ohne "=".',
  },
];

/**
 * Externe Tools/Dienste, die KEINE eigenen n8n-Node-Typen sind, aber besonderes
 * Verdrahtungs-Verhalten haben (z.B. Fireflies transkribiert selbst → als Quelle anbinden).
 * Wird vom node-resolver UND im Prompt konsultiert.
 */
export interface ToolCapability {
  /** Tool-/Dienst-Name + Phrasen, die darauf zeigen. */
  aliases: string[];
  /** Liefert dieses Ergebnis selbst → KEIN separater KI-/Action-Schritt dafür. */
  selfProduces?: string;
  /** n8n-Node, über den der Dienst als Quelle/Trigger andockt. */
  triggerNode?: string;
  /** Kurzer Hinweis für Prompt/Resolver. */
  note: string;
}

export const TOOL_CAPABILITIES: ToolCapability[] = [
  {
    // Bewusst nur konkrete Dienst-NAMEN (nicht das generische „Transkript") — sonst würde
    // „Transkript zusammenfassen" fälschlich als Quelle erkannt statt als KI-Folgeschritt.
    aliases: ['fireflies', 'otter.ai', 'otter', 'tl;dv', 'tldv', 'fathom', 'meeting-bot', 'meeting bot'],
    selfProduces: 'transkript',
    triggerNode: 'n8n-nodes-base.webhook',
    note: 'Fireflies/Otter & Co. transkribieren Meetings SELBST → in n8n als Trigger/Quelle (Webhook „Transkript fertig") anbinden, KEIN KI-Transkriptions-Schritt. Zusammenfassen/Speichern sind eigene Folgeschritte.',
  },
];

/** Findet die Tool-Fähigkeit, die auf einen Text (Label/Tool) passt. */
export function matchToolCapability(text: string | null | undefined): ToolCapability | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  return TOOL_CAPABILITIES.find(c => c.aliases.some(a => t.includes(a)));
}

/** Universelle Regeln — klein, stabil, immer im Prompt. */
const UNIVERSAL_RULES = [
  'Schritt 1 = Trigger passend zur echten Quelle (neue Mail→gmailTrigger, Zeitplan→scheduleTrigger, Ereignis→webhook), nicht blind manualTrigger.',
  'EINE Node = EINE Aufgabe — nie zwei Aktionen in einem Schritt („transkribieren UND speichern" = zwei Nodes).',
  'Selbst-liefernde Tools (Fireflies/Otter transkribieren selbst) als Quelle/Trigger, KEIN extra KI-„transkribieren"-Schritt.',
  'Menschliche Freigabe = sendAndWait (Mensch antwortet) + Verzweigung mit RÜCKSCHLEIFE bei „Nein" — nie nur ein blanker IF.',
  'KI: feste Aufgabe (zusammenfassen/klassifizieren/extrahieren/aus Vorlage) → Basic LLM Chain; offene Aufgabe (Tools/entscheiden/mehrstufig) → AI Agent.',
  'Jeder Agent/Chain hat sein EIGENES Chat Model — ein Modell nie an zwei Agenten teilen.',
  'Sub-Node-only-Typen (lmChat*/memory*/tool*/embeddings*) nie im Hauptflow — per subNodeOf + connectionType-Edge an einen AI-Parent.',
  'IF/Switch-Ausgänge über branch; Merge-Eingänge über targetInput. Set nur bei echtem Feld-Mapping, nicht als Durchreich-Node.',
  'Dynamische Felder als Expression mit führendem "=": "={{ $json.feld }}".',
  'Pflichtfelder füllen (z.B. Airtable Base/Table) — tool-abhängige resourceLocator-Felder per Live-Optionen wählen, nicht leer lassen.',
  'Google-Dienste (Gmail/Sheets/Docs/Drive/Calendar/YouTube): zentrale Google-OAuth-App (3 Klicks), nie eigene OAuth-Clients/Token.',
];

const byType = new Map(NODE_MAP.map(e => [e.n8nType, e]));

export function nodeMapEntry(n8nType?: string | null): NodeMapEntry | undefined {
  return n8nType ? byType.get(n8nType) : undefined;
}

/**
 * Alias-Patterns → n8nType für Heuristik-Swaps („Schritt 2 soll Slack sein").
 * Reihenfolge: spezifischere/zuerst gelistete Nodes gewinnen — entspricht dem
 * bisherigen SWAP_TARGETS-Verhalten (KI-Provider vor generischen Begriffen).
 */
export function swapTargets(): [RegExp, string][] {
  const order = [
    '@n8n/n8n-nodes-langchain.openAi',
    '@n8n/n8n-nodes-langchain.lmChatMistralCloud',
    '@n8n/n8n-nodes-langchain.lmChatAnthropic',
    '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
    '@n8n/n8n-nodes-langchain.agent',
  ];
  const prioritized = [
    ...order.map(t => byType.get(t)!).filter(Boolean),
    ...NODE_MAP.filter(e => !order.includes(e.n8nType)),
  ];
  return prioritized.map(e => {
    const alternatives = e.aliases
      .map(a => {
        const escaped = a.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s?');
        // Kurze Aliase ("ki", "js") nur als ganzes Wort matchen.
        return a.trim().length <= 3 ? `${escaped}\\b` : escaped;
      })
      .filter(Boolean);
    return [new RegExp(`\\b(?:${alternatives.join('|')})`, 'i'), e.n8nType] as [RegExp, string];
  });
}

let cachedSwapTargets: [RegExp, string][] | null = null;

/**
 * Bester HAUPTFLOW-Node (kein Sub-Node) für einen freien Text per Alias-Match.
 * Nutzt die swapTargets-Priorisierung; überspringt Sub-Node-only-Typen, damit
 * ein Schritt nie auf ein Chat-Model o.ä. gemappt wird.
 */
export function matchMainNodeType(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  if (!cachedSwapTargets) cachedSwapTargets = swapTargets();
  for (const [re, type] of cachedSwapTargets) {
    const entry = byType.get(type);
    if (entry?.subNodeSlot) continue;
    if (re.test(text)) return type;
  }
  return undefined;
}

function entryLine(e: NodeMapEntry): string {
  const flags = [
    e.role,
    e.subNodeSlot ? `NUR Sub-Node:${e.subNodeSlot}` : null,
    e.selfProduces ? `liefert-selbst:${e.selfProduces}` : null,
    e.credentialType ? `cred:${e.credentialType}` : null,
    e.typicalOps?.length ? `ops:${e.typicalOps.join(',')}` : null,
  ].filter(Boolean).join(' · ');
  const job = e.oneJob ? ` Aufgabe: ${e.oneJob}` : '';
  return `- ${e.n8nType} (${e.displayName}) [${flags}] — ${e.wiringNote}${job}`;
}

/**
 * Kompakter Node-Map-Block für den Editor-System-Prompt.
 * Rendert universelle Regeln + Patterns (immer) und Details NUR zu den
 * übergebenen relevanten n8nTypes (Workflow-Nodes + Kandidaten) —
 * so bleibt der Prompt konstant klein, egal wie groß NODE_MAP wird.
 */
export function formatNodeMapForPrompt(relevantTypes: Iterable<string>): string {
  const seen = new Set<string>();
  const entries: NodeMapEntry[] = [];
  for (const t of relevantTypes) {
    if (seen.has(t)) continue;
    seen.add(t);
    const e = byType.get(t);
    if (e) entries.push(e);
  }

  const lines: string[] = [];
  lines.push('NODE-MAP — SO BAUST DU NODES ZUSAMMEN:');
  lines.push('Grundregeln:');
  for (const r of UNIVERSAL_RULES) lines.push(`- ${r}`);
  lines.push('Bau-Patterns:');
  for (const p of WIRING_PATTERNS) lines.push(`- ${p.name} (${p.wann}) → ${p.bau}`);
  if (TOOL_CAPABILITIES.length) {
    lines.push('Tools mit Eigenheiten:');
    for (const c of TOOL_CAPABILITIES) lines.push(`- ${c.aliases[0]}${c.selfProduces ? ` (liefert ${c.selfProduces} selbst)` : ''}: ${c.note}`);
  }
  if (entries.length) {
    lines.push('Details zu den relevanten Nodes:');
    for (const e of entries) lines.push(entryLine(e));
  }
  return lines.join('\n');
}
