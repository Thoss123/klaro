/**
 * Build the coach system prompt with placeholders filled — mirrors /api/chat injection.
 * Used by dev tools (context inspector, chat export).
 */
import { getSystemPrompt } from '@/lib/claude';
import { getCoachSystemPrompt, isCoachV2Enabled } from '@/lib/coach/assemble';
import { formatTeamSize, isSoloTeam } from '@/lib/onboarding-labels';
import { resolveDiagnosePath } from '@/lib/onboarding-multi';
import { formatToolRecommendations } from '@/lib/tool-recommendations';
import { getBuiltWorkflows, getWorkflowPlans } from '@/lib/workflow-plans';
import { formatDataLayerForPrompt } from '@/lib/data-layer';
import { formatNodeMapForPrompt } from '@/lib/node-map';
import type { CanvasData, DocumentTemplate, OnboardingData } from '@/lib/types';

export type BuildInjectedPromptInput = {
  phase: string;
  onboarding?: Partial<OnboardingData> | null;
  canvas?: CanvasData | null;
  strategie?: string | null;
  /** Combined session + project memory injected as {{memory}} */
  memoryText?: string | null;
};

export function buildInjectedSystemPrompt(input: BuildInjectedPromptInput): string {
  const { phase, onboarding, canvas, strategie, memoryText } = input;
  const currentPhase = phase || 'diagnose';

  let systemPrompt = getSystemPrompt(currentPhase);
  if (isCoachV2Enabled()) {
    const v2Prompt = getCoachSystemPrompt(currentPhase);
    if (v2Prompt) systemPrompt = v2Prompt;
  }

  if (onboarding) {
    const isSolo = isSoloTeam(onboarding.unternehmensgroesse);
    const ugVal = formatTeamSize(onboarding.unternehmensgroesse);
    const vorname = (onboarding.vorname || onboarding.username || '').trim() || 'Nutzer';
    const firmenname = onboarding.firmenname?.trim() || 'Nicht angegeben';
    const rolle = onboarding.rolle_im_unternehmen?.trim() || 'Nicht angegeben';
    const anredeText = isSolo
      ? `Sprich den Nutzer mit dem Vornamen "${vorname}" an (Du-Form).`
      : `Sprich die Gruppe mit "ihr" an; Ansprechpartner: ${vorname}.`;
    const brancheVal = onboarding.branche?.trim() || 'Nicht angegeben';
    const rechercheVal = onboarding.firmen_recherche?.trim();
    const rechercheHinweis = rechercheVal
      ? ` Automatisch recherchiert (ungeprüft): ${rechercheVal}`
      : '';
    const firmenKontext =
      firmenname !== 'Nicht angegeben'
        ? `Unternehmen: ${firmenname}${brancheVal !== 'Nicht angegeben' ? ` (${brancheVal})` : ''}. Rolle: ${rolle}.${rechercheHinweis}`
        : `Rolle: ${rolle}.`;

    systemPrompt = systemPrompt
      .replace(/{{vorname}}/g, vorname)
      .replace(/{{firmenname}}/g, firmenname)
      .replace(/{{rolle}}/g, rolle)
      .replace(/{{firmen_kontext}}/g, firmenKontext)
      .replace(/{{branche}}/g, brancheVal)
      .replace(/{{ziel}}/g, onboarding.ziel || 'Nicht angegeben')
      .replace(/{{ki_erfahrung}}/g, onboarding.ki_erfahrung || 'Nicht angegeben')
      .replace(/{{wer_setzt_um}}/g, onboarding.wer_setzt_um || 'Nicht angegeben')
      .replace(/{{technik_level}}/g, onboarding.technik_level || 'Nicht angegeben')
      .replace(/{{hindernis}}/g, onboarding.hindernis || 'Nicht angegeben')
      .replace(/{{tempo}}/g, onboarding.tempo || 'Nicht angegeben')
      .replace(/{{unternehmensgroesse}}/g, ugVal)
      .replace(/{{anrede}}/g, anredeText)
      .replace(/{{memory}}/g, memoryText?.trim() || onboarding.memory?.trim() || 'Bisher keine Historie.');

    let pfadLogik = 'Keine besondere Pfad-Anweisung. Führe eine klassische, offene Diagnose durch.';
    if (currentPhase === 'diagnose' && onboarding.ziel) {
      const path = resolveDiagnosePath(onboarding.ziel);
      if (path === 'B') {
        pfadLogik = 'Pfad B: Der Nutzer hat gesagt, er hat schon konkrete Ideen. Überspringe die offene Diagnose von null auf.';
      } else if (path === 'C') {
        pfadLogik = 'Pfad C: Der Nutzer will erst einmal evaluieren, ob KI überhaupt sinnvoll ist.';
      } else if (path === 'D') {
        pfadLogik = 'Pfad D: Der Nutzer will am Ende ein Briefing für seine IT-Abteilung.';
      } else if (path === 'E') {
        pfadLogik = 'Pfad E: Der Nutzer hat einen genauen Plan und will nur noch umsetzen.';
      } else {
        pfadLogik = 'Pfad A: Klassischer Flow — breit starten, Ineffizienzen finden.';
      }
    }
    systemPrompt = systemPrompt.replace(/{{pfad_logik}}/g, pfadLogik);
  } else {
    systemPrompt = systemPrompt.replace(/{{memory}}/g, memoryText?.trim() || 'Bisher keine Historie.');
  }

  const dataLayerText = formatDataLayerForPrompt(
    canvas?.data_layer
      ? {
          source_type: canvas.data_layer.source_type,
          source_name: canvas.data_layer.source_name ?? null,
          auto_provisioned: canvas.data_layer.auto_provisioned ?? false,
        }
      : undefined,
  );
  systemPrompt = systemPrompt.replace(/{{data_layer}}/g, dataLayerText);

  const painPointsJson = canvas?.pain_points?.length
    ? JSON.stringify(canvas.pain_points, null, 2)
    : '[]';
  const workflowsJson = canvas?.workflows?.length
    ? JSON.stringify(getBuiltWorkflows(canvas), null, 2)
    : '[]';
  const workflowPlansJson = canvas
    ? JSON.stringify(getWorkflowPlans(canvas), null, 2)
    : '[]';
  const companyJson = canvas?.company ? JSON.stringify(canvas.company, null, 2) : '{}';
  const templatesSummary = (canvas?.document_templates ?? []).map((t: DocumentTemplate) => ({
    id: t.id,
    title: t.title,
    linked_workflow: t.linked_workflow,
    role: t.role,
    delivery: t.delivery,
    source: t.source,
    placeholders: t.placeholders.map((p: { key: string }) => p.key),
    has_example: !!t.example_filled,
  }));
  const documentTemplatesJson = templatesSummary.length
    ? JSON.stringify(templatesSummary, null, 2)
    : '[]';

  systemPrompt = systemPrompt
    .replace(/{{document_templates}}/g, documentTemplatesJson)
    .replace(/{{pain_points}}/g, painPointsJson)
    .replace(/{{workflows}}/g, workflowsJson)
    .replace(/{{workflow_plans}}/g, workflowPlansJson)
    .replace(/{{company}}/g, companyJson)
    .replace(/{{tool_recommendations}}/g, formatToolRecommendations())
    .replace(/{{strategie}}/g, strategie?.trim() || 'Noch keine Strategie vorhanden.');

  const nodeMapRules = formatNodeMapForPrompt([
    'n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.webhook', 'n8n-nodes-base.gmailTrigger',
    'n8n-nodes-base.formTrigger', 'n8n-nodes-base.gmail', 'n8n-nodes-base.slack',
    'n8n-nodes-base.if', 'n8n-nodes-base.switch', 'n8n-nodes-base.merge', 'n8n-nodes-base.wait',
    '@n8n/n8n-nodes-langchain.agent', '@n8n/n8n-nodes-langchain.chainLlm',
    '@n8n/n8n-nodes-langchain.chainSummarization', '@n8n/n8n-nodes-langchain.informationExtractor',
    'n8n-nodes-base.googleDrive', 'n8n-nodes-base.googleDocs', 'n8n-nodes-base.googleSheets',
    'n8n-nodes-base.airtable', 'n8n-nodes-base.set', 'n8n-nodes-base.httpRequest',
  ]);
  systemPrompt = systemPrompt.replace(/{{node_map_rules}}/g, nodeMapRules);

  systemPrompt = systemPrompt.replace(
    /{{heute}}/g,
    new Date().toLocaleDateString('de-DE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
  );

  if (canvas?.use_cases) {
    systemPrompt = systemPrompt.replace(/{{use_cases}}/g, JSON.stringify(canvas.use_cases, null, 2));
  }

  return systemPrompt;
}

/** Rough token estimate for dev tooling. */
export function estimatePromptTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
