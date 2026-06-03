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
}: {
  messages: Message[]
  onEdit?: (id: string, newContent: string) => void
  /** Rendered directly above the last assistant message (agent tool-call feed) */
  injectBeforeLastAssistant?: React.ReactNode
  isStreaming?: boolean
  className?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, injectBeforeLastAssistant]);

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
    <div className={`flex-1 min-h-0 overflow-y-auto px-6 py-8 bg-white ${className}`} ref={scrollRef}>
      {visibleMessages.map((m, i) => (
        <React.Fragment key={m.id}>
          {i === lastAssistantIdx && injectBeforeLastAssistant}
          <MessageBubble message={m} onEdit={onEdit} />
        </React.Fragment>
      ))}
      {showStreamLoader && <ChatPendingLoader />}
    </div>
  );
}
