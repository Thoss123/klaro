/**
 * Shared coach context for Workflow-Editor-Chat (gleicher Kontext wie Haupt-Chat).
 */

import { stripInternalTags } from '@/lib/strip-internal-tags';
import { getBuiltWorkflows, getWorkflowPlans } from '@/lib/workflow-plans';
import type { CanvasData, Message, OnboardingData } from '@/lib/types';

export type WorkflowEditorChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type WorkflowEditorCoachContext = {
  phase?: string;
  onboarding?: OnboardingData;
  canvas?: CanvasData;
  /** Aktuell geöffneter Workflow — andere Builds nur als Kontext. */
  activeWorkflowId?: string;
  /** Editor-eigener Verlauf (bleibt im Modal, nicht im linken Chat). */
  editorHistory?: WorkflowEditorChatTurn[];
  /** Letzte Nachrichten aus dem Haupt-Chat als Hintergrund. */
  mainChatHistory?: WorkflowEditorChatTurn[];
};

const MAX_MAIN_CHAT_TURNS = 10;
const MAX_EDITOR_TURNS = 12;

export function mainChatHistoryForEditor(messages: Message[]): WorkflowEditorChatTurn[] {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.role === 'assistant' ? stripInternalTags(m.content) : m.content.trim(),
    }))
    .filter(m => m.content.trim().length > 0)
    .slice(-MAX_MAIN_CHAT_TURNS);
}

export function formatCoachContextBlock(ctx?: WorkflowEditorCoachContext): string {
  if (!ctx) return '';

  const parts: string[] = [];

  if (ctx.phase) parts.push(`Aktive Projektphase: ${ctx.phase}`);

  const ob = ctx.onboarding;
  if (ob) {
    const firm = ob.firmenname?.trim();
    const branche = ob.branche?.trim();
    const ziel = ob.ziel?.trim();
    const vorname = ob.vorname?.trim() || ob.username?.trim();
    if (firm) parts.push(`Unternehmen: ${firm}${branche ? ` (${branche})` : ''}`);
    if (vorname) parts.push(`Ansprechpartner: ${vorname}`);
    if (ziel) parts.push(`Ziel aus Onboarding: ${ziel}`);
    if (ob.memory?.trim() && ob.memory !== 'Bisher keine Historie.') {
      parts.push(`Projekt-Memory:\n${ob.memory.trim()}`);
    }
  }

  const canvas = ctx.canvas;
  if (canvas) {
    const pains = canvas.pain_points?.slice(0, 6).map(p => `- ${p.title}`) ?? [];
    if (pains.length) parts.push(`Pain Points:\n${pains.join('\n')}`);

    const ucs = canvas.use_cases?.slice(0, 6).map(u =>
      `- ${u.title}${u.tools?.length ? ` (Tools: ${u.tools.join(', ')})` : ''}`,
    ) ?? [];
    if (ucs.length) parts.push(`Ist-Tools / Use Cases:\n${ucs.join('\n')}`);

    const plans = getWorkflowPlans(canvas).map(w => `- ${w.title} (${w.id})`);
    if (plans.length) parts.push(`Weitere Workflow-Pläne:\n${plans.join('\n')}`);

    const built = getBuiltWorkflows(canvas)
      .filter(w => w.id !== ctx.activeWorkflowId)
      .slice(0, 5)
      .map(w => `- ${w.title} (${w.id})`);
    if (built.length) parts.push(`Weitere gebaute Workflows:\n${built.join('\n')}`);
  }

  const main = ctx.mainChatHistory?.slice(-MAX_MAIN_CHAT_TURNS) ?? [];
  if (main.length) {
    parts.push(
      'Kürzlicher Haupt-Chat (Hintergrund — Antworten erscheinen NUR im Editor, nicht dort):\n'
      + main.map(m => `${m.role === 'user' ? 'Nutzer' : 'Klaro'}: ${m.content}`).join('\n'),
    );
  }

  const editor = ctx.editorHistory?.slice(-MAX_EDITOR_TURNS) ?? [];
  if (editor.length) {
    parts.push(
      'Bisheriger Editor-Chat in diesem Modal:\n'
      + editor.map(m => `${m.role === 'user' ? 'Nutzer' : 'Klaro'}: ${m.content}`).join('\n'),
    );
  }

  if (!parts.length) return '';
  return `\n\n--- KLARO-KONTEXT (wie Haupt-Coach) ---\n${parts.join('\n\n')}\n--- ENDE KONTEXT ---\n`;
}
