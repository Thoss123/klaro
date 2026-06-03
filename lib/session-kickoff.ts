import { Message } from '@/lib/types';
import { getHiddenInitMessage } from '@/lib/phase-welcome';
import { isHiddenSystemMessage } from '@/lib/hidden-chat';
import { stripInternalTags } from '@/lib/strip-internal-tags';

/** Whether an empty session should auto-start the coach. */
export function shouldAutoKickoffSession(
  messages: Message[],
  welcomeSent: boolean
): boolean {
  if (welcomeSent) return false;
  const hasVisibleAssistant = messages.some(
    m => m.role === 'assistant' && stripInternalTags(m.content).trim().length > 0
  );
  if (hasVisibleAssistant) return false;
  const hasVisibleUser = messages.some(
    m => m.role === 'user' && !isHiddenSystemMessage(m.content)
  );
  return !hasVisibleUser;
}

/** First message for a session — never reuse onboarding intro outside Phase 1. */
export function getSessionKickoff(
  phase: string,
  introMessage?: string | null
): { content: string; hidden: boolean } {
  if (phase === 'diagnose' && introMessage?.trim()) {
    return { content: introMessage.trim(), hidden: false };
  }
  return { content: getHiddenInitMessage(phase), hidden: true };
}

export function pickLatestSessionForPhase<
  T extends { phase: string | null; created_at: string }
>(sessions: T[], phase: string): T | undefined {
  return sessions
    .filter(s => (s.phase || 'diagnose') === phase)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}
