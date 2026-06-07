import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronLeft, ChevronRight, X, Pencil } from 'lucide-react';

export interface OptionChoice {
  id: string;
  label: string;
  detail?: string;
}

export interface ActiveOptions {
  question: string;
  choices: OptionChoice[];
}

/**
 * Parse a coach message for a trailing <options>{...}</options> tag.
 * Returns null if absent or malformed (fail-safe — never throws).
 */
export function parseOptionsTag(content: string): ActiveOptions | null {
  if (!content) return null;
  const match = content.match(/<options>([\s\S]*?)<\/options>/i);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    const choices = Array.isArray(parsed?.choices)
      ? parsed.choices
          .map((c: any, i: number) => ({
            id: String(c?.id ?? i + 1),
            label: typeof c?.label === 'string' ? c.label.trim() : '',
            detail: typeof c?.detail === 'string' ? c.detail.trim() : undefined,
          }))
          .filter((c: OptionChoice) => c.label)
      : [];
    if (!choices.length) return null;
    return {
      question: typeof parsed?.question === 'string' ? parsed.question.trim() : '',
      choices,
    };
  } catch {
    return null;
  }
}

const PAGE_SIZE = 4;

/**
 * Quick-reply card shown above the chat input. Click a choice to send it
 * immediately; or type a custom answer in the always-present free-text field.
 */
export default function OptionsCard({
  options,
  onSelect,
  onCustomSubmit,
  onDismiss,
}: {
  options: ActiveOptions;
  onSelect: (label: string) => void;
  onCustomSubmit: (text: string) => void;
  onDismiss: () => void;
}) {
  const [page, setPage] = useState(0);
  const [custom, setCustom] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const total = options.choices.length;
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const visible = options.choices.slice(start, start + PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [options]);

  const handleCustom = (e: FormEvent) => {
    e.preventDefault();
    const text = custom.trim();
    if (!text) return;
    setCustom('');
    onCustomSubmit(text);
  };

  return (
    <div className="mb-2 rounded-2xl border border-gray-200 bg-gray-900/95 text-gray-100 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10">
        <span className="text-sm font-medium text-gray-100 truncate">
          {options.question || 'Wähle eine Option'}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {pageCount > 1 && (
            <>
              <span className="text-xs text-gray-400 mr-1">
                {page + 1} von {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                aria-label="Vorherige Optionen"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="p-1 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
                aria-label="Weitere Optionen"
              >
                <ChevronRight size={16} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Choices */}
      <ul className="divide-y divide-white/5">
        {visible.map((choice, i) => (
          <li key={choice.id}>
            <button
              type="button"
              onClick={() => onSelect(choice.label)}
              className="group w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
            >
              <span className="shrink-0 w-5 text-sm tabular-nums text-gray-500 group-hover:text-gray-300">
                {start + i + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-gray-100 truncate">{choice.label}</span>
                {choice.detail && (
                  <span className="block text-xs text-gray-400 truncate">{choice.detail}</span>
                )}
              </span>
              <ArrowUp
                size={14}
                className="shrink-0 rotate-90 text-gray-600 group-hover:text-gray-300 transition-colors"
              />
            </button>
          </li>
        ))}
      </ul>

      {/* Custom answer */}
      <form onSubmit={handleCustom} className="flex items-center gap-2 px-4 py-2.5 border-t border-white/10">
        <Pencil size={14} className="shrink-0 text-gray-500" />
        <input
          ref={inputRef}
          value={custom}
          onChange={e => setCustom(e.target.value)}
          placeholder="Eigene Antwort…"
          className="flex-1 bg-transparent text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none"
        />
        {custom.trim() && (
          <button
            type="submit"
            className="shrink-0 w-7 h-7 flex items-center justify-center bg-white text-gray-900 rounded-full hover:bg-gray-200 transition-colors"
            aria-label="Eigene Antwort senden"
          >
            <ArrowUp size={14} strokeWidth={2.5} />
          </button>
        )}
      </form>
    </div>
  );
}
