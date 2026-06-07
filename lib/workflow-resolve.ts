import type { WorkflowStep } from '@/lib/types';

const GENERIC_N8N_TYPES = new Set([
  'n8n-nodes-base.aiTransform',
  'n8n-nodes-base.noOp',
]);

/** Steps still need NodeResolver (no concrete n8n type or generic placeholder). */
export function stepsNeedNodeResolve(steps: WorkflowStep[]): boolean {
  return steps.some(s => !s.n8nType || GENERIC_N8N_TYPES.has(s.n8nType));
}
