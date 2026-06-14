import React, { useCallback, useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { clsx } from 'clsx';
import { User, Copy, ThumbsUp, ThumbsDown, Check } from 'lucide-react';
import { Message } from '@/lib/types';
import { stripInternalTags } from '@/lib/strip-internal-tags';
import { parseUserAttachments } from '@/lib/chat-attachments';
import MessageFeedbackSurvey from './MessageFeedbackSurvey';
import {
  saveMessageFeedback,
  updateMessageFeedback,
  type FeedbackContextMessage,
} from '@/lib/supabase-chat';

export type MessageFeedbackContext = {
  sessionId: string | null;
  phase: string;
  /** Die letzten 5 sichtbaren Nachrichten bis einschließlich dieser — Kontext für die AI-Auswertung. */
  recentMessages: FeedbackContextMessage[];
};

// Tabellen (Tool-Vergleiche) hübsch + horizontal scrollbar — der Chat ist schmal.
const markdownComponents: Components = {
  table: ({ children }) => (
    <div className="overflow-x-auto -mx-1 my-3 rounded-lg border border-gray-200">
      <table className="!my-0 w-full min-w-[420px] text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="bg-gray-50 px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-t border-gray-100 px-3 py-2 align-top text-gray-600">{children}</td>
  ),
};

export default function MessageBubble({ message, feedback }: { message: Message, onEdit?: (id: string, newContent: string) => void, feedback?: MessageFeedbackContext }) {
  const { role, content, id } = message;
  const [isCopied, setIsCopied] = useState(false);
  const [thumbState, setThumbState] = useState<'up' | 'down' | null>(null);
  const [surveyOpen, setSurveyOpen] = useState(false);
  // Insert läuft async — Survey-Updates warten auf die Row-ID, damit ein
  // schneller Klick auf "Senden" das Insert nicht überholt.
  const feedbackIdRef = useRef<Promise<string | null> | null>(null);

  const handleThumb = (rating: 'up' | 'down') => {
    if (thumbState === rating) {
      // Bereits bewertet — zweiter Klick klappt nur die Umfrage zu/auf
      setSurveyOpen(open => !open);
      return;
    }
    setThumbState(rating);
    setSurveyOpen(true);

    if (!feedbackIdRef.current) {
      feedbackIdRef.current = saveMessageFeedback({
        sessionId: feedback?.sessionId ?? null,
        messageId: id,
        rating,
        phase: feedback?.phase ?? 'unknown',
        context: feedback?.recentMessages ?? [],
      });
    } else {
      // Daumen gewechselt — Rating auf der bestehenden Zeile aktualisieren
      feedbackIdRef.current.then(fid => {
        if (fid) updateMessageFeedback(fid, { rating });
      });
    }
  };

  const persistSurvey = useCallback((fields: { problem?: string; comment?: string }) => {
    feedbackIdRef.current?.then(fid => {
      if (fid) updateMessageFeedback(fid, fields);
    });
  }, []);

  const closeSurvey = useCallback(() => setSurveyOpen(false), []);

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
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{visibleContent}</ReactMarkdown>
        </div>
        <div className="flex items-center gap-2 mt-2 text-gray-400">
          <button onClick={handleCopy} className="p-1 hover:text-gray-700 transition-colors rounded-md hover:bg-gray-100/80" title="Kopieren">
            {isCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
          <button
            onClick={() => handleThumb('up')}
            className={clsx('p-1 transition-colors rounded-md hover:bg-gray-100/80', thumbState === 'up' ? 'text-indigo-600' : 'hover:text-gray-700')}
            title="Gute Antwort"
          >
            <ThumbsUp size={14} fill={thumbState === 'up' ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={() => handleThumb('down')}
            className={clsx('p-1 transition-colors rounded-md hover:bg-gray-100/80', thumbState === 'down' ? 'text-red-500' : 'hover:text-gray-700')}
            title="Schlechte Antwort"
          >
            <ThumbsDown size={14} fill={thumbState === 'down' ? 'currentColor' : 'none'} />
          </button>
        </div>
        {surveyOpen && thumbState && (
          <MessageFeedbackSurvey
            key={thumbState} /* Daumenwechsel = frische Umfrage */
            rating={thumbState}
            onSaveProblem={problem => persistSurvey({ problem })}
            onSaveComment={comment => persistSurvey({ comment })}
            onDone={closeSurvey}
          />
        )}
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
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{visibleContent}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
