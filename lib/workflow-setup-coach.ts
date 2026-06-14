/**
 * Phase 4 Setup-Coach — Parameter-Vorschläge + deutsche Anleitung pro Schritt.
 * Nutzt Phase-3-Kontext (note, Workflow-Titel, Reihenfolge).
 */

import type { StepConfig, Workflow, WorkflowStep } from './types';
import { isConfigured, requiresConfig } from './workflow-deploy';
import { mainWorkflowSteps, stepNumber } from './workflow-overview';
import { getNodeByName, getN8nCatalog } from './n8n-catalog';
import { buildInitialParameters } from './n8n-parameter-utils';

export type StepSetupGuide = {
  stepId: string;
  stepNumber: number;
  label: string;
  status: 'done' | 'open' | 'next';
  instructions: string;
  parameters?: Record<string, unknown>;
};

function slugPath(workflow: Workflow, step: WorkflowStep): string {
  const base = workflow.title
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  return `klaro-${base || 'wf'}-${step.id.replace(/[^a-z0-9]/gi, '').slice(-6)}`;
}

/** Sinnvolle Default-Parameter pro Node-Typ (Webhook, Schedule, Gmail …). */
export function suggestParametersForStep(
  step: WorkflowStep,
  workflow: Workflow,
): Record<string, unknown> {
  const n8n = step.n8nType ?? '';
  const short = n8n.split('.').pop() ?? '';

  if (n8n === 'n8n-nodes-base.webhook') {
    return {
      httpMethod: 'POST',
      path: slugPath(workflow, step),
      responseMode: 'onReceived',
      authentication: 'none',
    };
  }

  if (n8n === 'n8n-nodes-base.scheduleTrigger') {
    return {
      rule: { interval: [{ field: 'hours', hoursInterval: 24 }] },
    };
  }

  if (short === 'gmail') {
    return {
      resource: 'message',
      operation: 'send',
      sendTo: '={{ $json.email || $json.to }}',
      subject: '={{ $json.subject || "Nachricht von Klaro" }}',
      message: '={{ $json.body || $json.text }}',
    };
  }

  if (short === 'airtable') {
    return {
      operation: 'search',
      application: '',
      table: '',
    };
  }

  if (short === 'slack') {
    return {
      resource: 'message',
      operation: 'post',
      text: '={{ $json.message || $json.text }}',
    };
  }

  if (/lmChatMistral/i.test(n8n)) {
    return { model: 'mistral-small-latest' };
  }

  if (/lmChatOpenAi|openAi/i.test(n8n)) {
    return { model: 'gpt-4o-mini' };
  }

  return {};
}

function guideForNode(step: WorkflowStep, workflow: Workflow, nr: number): string {
  const n8n = step.n8nType ?? '';
  const short = n8n.split('.').pop() ?? '';
  const zweck = step.note ? `\nZweck im Plan: ${step.note}` : '';

  if (n8n === 'n8n-nodes-base.manualTrigger') {
    return `Schritt ${nr} — Start (manuell): Zum Testen auf „Ausführen" in n8n klicken. Für Live-Betrieb oft auf Webhook oder Zeitplan wechseln.${zweck}`;
  }

  if (n8n === 'n8n-nodes-base.webhook') {
    const path = slugPath(workflow, step);
    return `Schritt ${nr} — Webhook-Trigger:${zweck}
1. Klick auf den Start-Node (rot) im Canvas.
2. Methode: POST (für Formulare, CRM, externe Systeme).
3. Pfad: „${path}" — eindeutig, nur Kleinbuchstaben/Zahlen.
4. Nach dem Deploy zeigt n8n dir die Production-URL (und Test-URL). Die kopierst du in das System, das den Workflow auslösen soll.
5. Test: curl -X POST <deine-webhook-url> -H "Content-Type: application/json" -d '{"test":true}'
6. Speichern im Seitenpanel, wenn Methode und Pfad passen.`;
  }

  if (n8n === 'n8n-nodes-base.scheduleTrigger') {
    return `Schritt ${nr} — Zeitplan:${zweck}
1. Öffne den Node → Intervall wählen (z. B. täglich 8:00).
2. Zeitzone auf Europe/Berlin stellen wenn nötig.
3. Speichern — der Workflow läuft dann automatisch.`;
  }

  if (short === 'gmail') {
    return `Schritt ${nr} — Gmail:${zweck}
1. Google-Konto in 3 Klicks verbinden: „Mit Google verbinden" → Konto wählen → Bestätigen (zentrale Klaro-OAuth-App, kein eigener API-Zugang nötig).
2. Operation: Nachricht senden — Empfänger/Betreff/Text aus vorherigem Schritt ({{ $json }}).`;
  }

  if (short === 'airtable') {
    return `Schritt ${nr} — Airtable:${zweck}
1. Airtable Personal Access Token als Credential.
2. Base und Tabelle aus deinem CRM wählen.
3. Operation passend zum Plan (lesen/suchen/erstellen).`;
  }

  if (/agent/i.test(short)) {
    return `Schritt ${nr} — KI-Agent:${zweck}
1. Unten am Node: Chat Model* per „+" verbinden (z. B. Mistral/OpenAI).
2. Model im Sub-Node wählen + API-Key eintragen.
3. Optional: Memory und Tools hinzufügen.
4. Pflicht: Chat Model muss grün/konfiguriert sein vor Deploy.`;
  }

  if (/lmChat|openAi/i.test(short)) {
    return `Schritt ${nr} — KI-Modell:${zweck}
1. Model aus Dropdown wählen (z. B. mistral-small für günstig, large für stark).
2. API-Key des Anbieters eintragen und speichern.`;
  }

  if (short === 'if') {
    return `Schritt ${nr} — Verzweigung (IF):${zweck}
1. Bedingung setzen (z. B. Feld nicht leer).
2. Ja-/Nein-Ausgang im Canvas prüfen — beide Pfade verbunden?`;
  }

  return `Schritt ${nr} — „${step.label}":${zweck}
1. Node anklicken → Seitenpanel öffnet sich.
2. Pflichtfelder und Credential ausfüllen → Speichern.
3. Roter Rand (!) = noch etwas fehlt.`;
}

/** Alle Schritte mit Status + Anleitung, nächster offener Schritt markiert. */
export function buildSetupGuides(
  workflow: Workflow,
  stepConfigs: Record<string, StepConfig> = {},
): StepSetupGuide[] {
  const main = mainWorkflowSteps(workflow.steps);
  let foundNext = false;

  return main.map(step => {
    const nr = stepNumber(workflow.steps, step.id);
    const done = isConfigured(step, stepConfigs[step.id]);
    const status: StepSetupGuide['status'] = done
      ? 'done'
      : !foundNext
        ? (foundNext = true, 'next')
        : 'open';

    const suggested = suggestParametersForStep(step, workflow);
    const existing = stepConfigs[step.id]?.parameters ?? step.parameters ?? {};

    return {
      stepId: step.id,
      stepNumber: nr,
      label: step.label,
      status,
      instructions: guideForNode(step, workflow, nr),
      parameters: { ...suggested, ...existing },
    };
  });
}

export function nextOpenStepId(guides: StepSetupGuide[]): string | undefined {
  return guides.find(g => g.status === 'next')?.stepId;
}

/** Deutsche Coach-Nachricht für Chat-Feedback. */
export function formatCoachMessage(
  workflow: Workflow,
  guides: StepSetupGuide[],
  headline?: string,
): string {
  const done = guides.filter(g => g.status === 'done').length;
  const total = guides.filter(g => g.label).length;
  const next = guides.find(g => g.status === 'next');

  const lines: string[] = [];
  if (headline) lines.push(headline);
  if (workflow.linked_pain_point) {
    lines.push(`Workflow für: ${workflow.linked_pain_point}`);
  }
  lines.push(`Fortschritt: ${done}/${total} Schritte bereit.`);

  if (next) {
    lines.push('');
    lines.push(`Als Nächstes — Schritt ${next.stepNumber}: „${next.label}"`);
    lines.push(next.instructions);
  } else if (done === total) {
    lines.push('');
    lines.push('Alle Schritte konfiguriert — du kannst jetzt deployen.');
  }

  return lines.join('\n');
}

/** Parameter auf Steps + StepConfig-Updates anwenden. */
export async function enrichStepsWithSetup(
  workflow: Workflow,
  steps: WorkflowStep[],
  stepConfigs: Record<string, StepConfig> = {},
): Promise<{
  steps: WorkflowStep[];
  stepConfigUpdates: Record<string, Partial<StepConfig>>;
}> {
  const catalog = await getN8nCatalog();
  const updates: Record<string, Partial<StepConfig>> = {};

  const enriched = steps.map(step => {
    if (!requiresConfig(step)) return step;

    const suggested = suggestParametersForStep(step, workflow);
    const existingCfg = stepConfigs[step.id];
    const mergedParams = {
      ...suggested,
      ...(step.parameters ?? {}),
      ...(existingCfg?.parameters ?? {}),
    };

    const nodeDef = step.n8nType ? getNodeByName(catalog, step.n8nType) : undefined;
    const withDefaults = nodeDef
      ? { ...buildInitialParameters(nodeDef.properties || []), ...mergedParams }
      : mergedParams;

    if (Object.keys(withDefaults).length > 0) {
      updates[step.id] = {
        configType: 'n8n',
        n8nType: step.n8nType,
        n8nTypeVersion: step.n8nTypeVersion,
        parameters: withDefaults,
        credentialType: existingCfg?.credentialType ?? step.credentialType ?? nodeDef?.credentials?.[0]?.name,
      };
    }

    return Object.keys(withDefaults).length
      ? { ...step, parameters: withDefaults }
      : step;
  });

  return { steps: enriched, stepConfigUpdates: updates };
}

export function isCoachingIntent(message: string): boolean {
  return /(einrichten|konfigur|einstellen|webhook|webhook-?url|url|credential|api.?key|zugang|was muss|nächste|hilf|anleitung|wie (richt|bekomm|stell|trigg)|path|pfad|methode|deploy)/i.test(
    message,
  );
}
