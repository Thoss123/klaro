import React, { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import { Message } from '@/lib/types';

export default function ChatWindow({ messages, onEdit }: { messages: Message[], onEdit?: (id: string, newContent: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50" ref={scrollRef}>
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} onEdit={onEdit} />
      ))}
    </div>
  );
}
