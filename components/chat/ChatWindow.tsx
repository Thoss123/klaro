import React, { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import { Message } from '@/lib/types';

export default function ChatWindow({
  messages,
  onEdit,
  injectBeforeLastAssistant,
}: {
  messages: Message[]
  onEdit?: (id: string, newContent: string) => void
  /** Rendered directly above the last assistant message (agent tool-call feed) */
  injectBeforeLastAssistant?: React.ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, injectBeforeLastAssistant]);

  // Index of the last assistant message
  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i;
    }
    return -1;
  })();

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50" ref={scrollRef}>
      {messages.map((m, i) => (
        <React.Fragment key={m.id}>
          {/* Agent tool-call feed appears ABOVE the last assistant message */}
          {i === lastAssistantIdx && injectBeforeLastAssistant}
          <MessageBubble message={m} onEdit={onEdit} />
        </React.Fragment>
      ))}
    </div>
  );
}
