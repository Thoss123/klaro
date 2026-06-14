import React, { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import ChatPendingLoader from './ChatPendingLoader';
import { Message } from '@/lib/types';
import { isHiddenSystemMessage } from '@/lib/hidden-chat';
import { stripInternalTags } from '@/lib/strip-internal-tags';

export default function ChatWindow({
  messages,
  onEdit,
  injectBeforeLastAssistant,
  isStreaming,
  className = '',
  sessionId = null,
  phase = 'diagnose',
}: {
  messages: Message[]
  onEdit?: (id: string, newContent: string) => void
  /** Rendered directly above the last assistant message (agent tool-call feed) */
  injectBeforeLastAssistant?: React.ReactNode
  isStreaming?: boolean
  className?: string
  /** Für Daumen-Feedback: wird mit Phase + letzten 5 Nachrichten gespeichert */
  sessionId?: string | null
  phase?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Auto-Scroll nur solange der Nutzer unten "klebt" — scrollt er während des
  // Streamens hoch, bleibt seine Position erhalten (kein Zurückreißen).
  const stickToBottomRef = useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isStreaming]);

  const visibleMessages = messages.filter(
    m => !(m.role === 'user' && isHiddenSystemMessage(m.content))
  );

  const lastAssistantIdx = (() => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      if (visibleMessages[i].role === 'assistant') return i;
    }
    return -1;
  })();

  const lastMsg = visibleMessages[visibleMessages.length - 1];
  const lastVisibleText = lastMsg ? stripInternalTags(lastMsg.content).trim() : '';
  const showStreamLoader =
    isStreaming &&
    (!lastMsg ||
      lastMsg.role === 'user' ||
      (lastMsg.role === 'assistant' && !lastVisibleText));

  return (
    <div className={`flex-1 min-h-0 overflow-y-auto px-6 py-8 bg-white ${className}`} ref={scrollRef} onScroll={handleScroll}>
      {visibleMessages.map((m, i) => (
        <React.Fragment key={m.id}>
          {i === lastAssistantIdx && injectBeforeLastAssistant}
          <MessageBubble
            message={m}
            onEdit={onEdit}
            feedback={
              m.role === 'assistant'
                ? {
                    sessionId,
                    phase,
                    recentMessages: visibleMessages
                      .slice(Math.max(0, i - 4), i + 1)
                      .map(msg => ({
                        role: msg.role,
                        content: stripInternalTags(msg.content).slice(0, 4000),
                      })),
                  }
                : undefined
            }
          />
        </React.Fragment>
      ))}
      {showStreamLoader && <ChatPendingLoader />}
    </div>
  );
}
