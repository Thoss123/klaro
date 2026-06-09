import { isHiddenSystemMessage } from '@/lib/hidden-chat';
import { parseUserAttachments } from '@/lib/chat-attachments';

const PHASE_LABELS: Record<string, string> = {
  diagnose: '1. Diagnose',
  analyse: '2. Analyse',
  plan: '3. Plan',
  umsetzung: '4. Umsetzung',
};

export function phaseDefaultLabel(phase: string): string {
  return PHASE_LABELS[phase] || 'Chat';
}

/** Title for a new session in a project (numbered when not the first). */
export function numberedSessionTitle(phase: string, existingSamePhaseCount: number): string {
  const base = phaseDefaultLabel(phase);
  const n = existingSamePhaseCount + 1;
  return n > 1 ? `${base} #${n}` : base;
}

/** Title from first visible user message. */
export function titleFromUserMessage(content: string, phase: string): string | null {
  if (isHiddenSystemMessage(content)) return null;
  const { text } = parseUserAttachments(content);
  const trimmed = text.trim();
  if (trimmed.length < 3) return null;
  const excerpt = trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
  return `${phaseDefaultLabel(phase)} — ${excerpt}`;
}
