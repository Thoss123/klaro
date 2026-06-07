/**
 * Phase 4 deploy helpers — n8n catalog-aware configuration checks.
 */

import { aiSlotsFor, subNodeCount } from './ai-subnodes';
import { WorkflowStep, StepConfig } from './types';

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

  const needsCred = !!(config?.credentialType || step.credentialType);
  if (needsCred && !config?.credentialValue?.trim()) return false;

  // AI-Parent: Pflicht-Slots (z. B. Chat Model*) müssen verbunden sein.
  for (const slot of aiSlotsFor(step.n8nType)) {
    if (slot.required && subNodeCount(step, slot.slot) === 0) return false;
  }

  return true;
}

export function buildParameters(step: WorkflowStep, config?: StepConfig): Record<string, unknown> | undefined {
  if (config?.parameters && Object.keys(config.parameters).length > 0) {
    return config.parameters;
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
