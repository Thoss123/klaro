import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { clsx } from 'clsx';
import { User, Copy, ThumbsUp, ThumbsDown, Check } from 'lucide-react';
import { Message } from '@/lib/types';
import { stripInternalTags } from '@/lib/strip-internal-tags';
import { parseUserAttachments } from '@/lib/chat-attachments';

export default function MessageBubble({ message }: { message: Message, onEdit?: (id: string, newContent: string) => void }) {
  const { role, content, id } = message;
  const [isCopied, setIsCopied] = useState(false);
  const [thumbState, setThumbState] = useState<'up' | 'down' | null>(null);

  const { text: userText, attachments: userAttachments } =
    role === 'user' ? parseUserAttachments(content) : { text: content, attachments: [] };
  const visibleContent = stripInternalTags(role === 'user' ? userText : content);

  const isPhase4Only = content.includes('<request_credential>') || content.includes('<deploy_workflow>') || content.includes('<test_workflow>') || content.includes('<activate_workflow>');

  const hasInternalOnly =
    !visibleContent &&
    (/<trigger_canvas_update/i.test(content) ||
      /trigger_canvas_update/i.test(content) ||
      /<phase_complete/i.test(content) ||
      /<prepare_phase/i.test(content) ||
      /<tool_call/i.test(content));

  if (hasInternalOnly && role === 'assistant' && !isPhase4Only) {
    return null;
  }

  const imagePreviews = userAttachments
    .filter(a => a.type === 'image' && (a.url || a.preview))
    .map(a => a.url || a.preview!);

  if (!visibleContent && !imagePreviews.length) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(visibleContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (role === 'assistant') {
    return (
      <div className="mb-8 group max-w-[92%]">
        <div
          className="prose prose-sm prose-slate max-w-none text-gray-800 leading-relaxed"
          style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
        >
          <ReactMarkdown>{visibleContent}</ReactMarkdown>
        </div>
        <div className="flex items-center gap-2 mt-2 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={handleCopy} className="p-1 hover:text-gray-700 transition-colors rounded-md hover:bg-gray-100/80" title="Kopieren">
            {isCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
          <button
            onClick={() => setThumbState(prev => prev === 'up' ? null : 'up')}
            className={clsx('p-1 transition-colors rounded-md hover:bg-gray-100/80', thumbState === 'up' ? 'text-indigo-600' : 'hover:text-gray-700')}
            title="Gute Antwort"
          >
            <ThumbsUp size={14} />
          </button>
          <button
            onClick={() => setThumbState(prev => prev === 'down' ? null : 'down')}
            className={clsx('p-1 transition-colors rounded-md hover:bg-gray-100/80', thumbState === 'down' ? 'text-red-500' : 'hover:text-gray-700')}
            title="Schlechte Antwort"
          >
            <ThumbsDown size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 mb-6 flex-row-reverse group">
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-indigo-600 text-white">
        <User size={18} />
      </div>
      <div className="flex flex-col max-w-[80%] items-end">
        <div className="rounded-2xl px-4 py-3 bg-indigo-600 text-white relative">
          {imagePreviews.length > 0 && (
            <div className={`flex flex-wrap gap-2 ${visibleContent ? 'mb-3' : ''}`}>
              {imagePreviews.map((src, i) => (
                <img
                  key={`${id}-img-${i}`}
                  src={src}
                  alt=""
                  className="max-w-[200px] max-h-[160px] rounded-xl object-cover border border-white/20"
                />
              ))}
            </div>
          )}
          {visibleContent && (
            <div
              className="prose prose-sm max-w-none prose-invert"
              style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
            >
              <ReactMarkdown>{visibleContent}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
