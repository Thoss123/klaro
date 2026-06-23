/**
 * Phase 4 deploy helpers — n8n catalog-aware configuration checks.
 */

import { aiSlotsFor, subNodeCount } from './ai-subnodes';
import { WorkflowStep, StepConfig } from './types';
import { isCentralCredential } from './central-credentials';

export function requiresConfig(step: WorkflowStep): boolean {
  if (step.subNodeOf) return true;
  if (step.type === 'human') return true;
  if (step.n8nType) return true;
  // Steps without n8n mapping still need a node picked
  return step.type !== 'output';
}

export function isConfigured(step: WorkflowStep, config?: StepConfig): boolean {
  if (!requiresConfig(step)) return true;

  const n8nType = config?.n8nType || step.n8nType;
  if (!n8nType) return false;

  const credType = config?.credentialType || step.credentialType;
  const needsCred = !!credType;
  // Central credentials (Resend SMTP, Twilio, …) are pre-configured — no user input needed.
  if (needsCred && !isCentralCredential(credType!) && !config?.credentialValue?.trim()) return false;

  // AI-Parent: Pflicht-Slots (z. B. Chat Model*) müssen verbunden sein.
  for (const slot of aiSlotsFor(step.n8nType)) {
    if (slot.required && subNodeCount(step, slot.slot) === 0) return false;
  }

  return true;
}

/** Default-User-Message (n8n-Expression): füttert den Agent mit den Upstream-Daten. */
const DEFAULT_AI_USER_TEXT = '={{ $json.chatInput ?? $json.input ?? JSON.stringify($json) }}';

/**
 * n8n-Parameter für einen KI-Node aus einem System-Prompt (Vorlage + Beispiel) bauen.
 * - AI Agent (`@n8n/n8n-nodes-langchain.agent`): options.systemMessage
 * - Basic LLM Chain (`@n8n/n8n-nodes-langchain.chainLlm`): messages.messageValues (SystemMessagePromptTemplate)
 * Andere Node-Typen → undefined (systemPrompt nicht anwendbar).
 */
export function buildAiNodeParameters(
  n8nType: string,
  systemPrompt: string,
  userPrompt?: string,
): Record<string, unknown> | undefined {
  const text = userPrompt && userPrompt.trim() ? userPrompt : DEFAULT_AI_USER_TEXT;
  if (n8nType.endsWith('.agent')) {
    return { promptType: 'define', text, options: { systemMessage: systemPrompt } };
  }
  if (n8nType.endsWith('.chainLlm')) {
    return {
      promptType: 'define',
      text,
      messages: {
        messageValues: [{ type: 'SystemMessagePromptTemplate', message: systemPrompt }],
      },
    };
  }
  return undefined;
}

export function buildParameters(step: WorkflowStep, config?: StepConfig): Record<string, unknown> | undefined {
  // Vom Nutzer im Schritt-Konfig explizit gesetzte Roh-Parameter haben Vorrang.
  if (config?.parameters && Object.keys(config.parameters).length > 0) {
    return config.parameters;
  }
  // KI-Node mit System-Prompt (z.B. Vorlage + Beispiel) → in echte n8n-Parameter übersetzen,
  // damit der Prompt beim Deploy wirklich im Node landet (nicht nur im Konfig-Panel sichtbar).
  const sys = config?.systemPrompt?.trim();
  const n8nType = config?.n8nType || step.n8nType;
  if (sys && n8nType) {
    const aiParams = buildAiNodeParameters(n8nType, sys, config?.userPrompt);
    if (aiParams) return aiParams;
  }
  if (step.parameters && Object.keys(step.parameters).length > 0) {
    return step.parameters;
  }
  return undefined;
}

export function configProgress(steps: WorkflowStep[], configs: Record<string, StepConfig>): { done: number; total: number } {
  const required = steps.filter(requiresConfig);
  const done = required.filter(s => isConfigured(s, configs[s.id])).length;
  return { done, total: required.length };
}

/** Credential tool name for Supabase user_credentials lookup. */
export function credentialToolName(config: StepConfig, step: WorkflowStep): string {
  if (config.credentialType) return config.credentialType;
  if (config.n8nType) return config.n8nType.split('.').pop() || config.n8nType;
  return step.tool || step.n8nType?.split('.').pop() || 'unknown';
}
