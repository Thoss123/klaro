import React, { FormEvent, useState } from 'react';
import { ArrowUp, ChevronLeft, ChevronRight, X, Pencil } from 'lucide-react';

export interface OptionChoice {
  id: string;
  label: string;
  detail?: string;
  /** Coach markiert die empfohlene Workflow-/Ablauf-Option. */
  recommended?: boolean;
}

export interface ActiveOptions {
  question: string;
  choices: OptionChoice[];
  questions?: OptionQuestion[];
  acknowledge?: boolean;
}

export interface OptionQuestion {
  id: string;
  question: string;
  choices: OptionChoice[];
  placeholder?: string;
}

function normalizeChoices(raw: unknown): OptionChoice[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c: { id?: unknown; label?: unknown; detail?: unknown; recommended?: unknown } | string, i: number) => {
      if (typeof c === 'string') {
        return { id: String(i + 1), label: c.trim() };
      }
      return {
        id: String(c?.id ?? i + 1),
        label: typeof c?.label === 'string' ? c.label.trim() : '',
        ...(typeof c?.detail === 'string' && c.detail.trim() ? { detail: c.detail.trim() } : {}),
        ...(c?.recommended === true ? { recommended: true as const } : {}),
      };
    })
    .filter((c: OptionChoice) => c.label);
}

/**
 * Parse a coach message for a trailing <options>{...}</options> tag.
 * Returns null if absent or malformed (fail-safe — never throws).
 */
export function parseOptionsTag(content: string): ActiveOptions | null {
  if (!content) return null;
  const matches = Array.from(content.matchAll(/<options>([\s\S]*?)<\/options>/gi));
  const match = matches[matches.length - 1];
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());

    const questions = Array.isArray(parsed?.questions)
      ? parsed.questions
          .map((q: { id?: unknown; question?: unknown; choices?: unknown; placeholder?: unknown }, i: number) => ({
            id: String(q?.id ?? `q${i + 1}`),
            question: typeof q?.question === 'string' ? q.question.trim() : '',
            choices: normalizeChoices(q?.choices),
            placeholder: typeof q?.placeholder === 'string' ? q.placeholder.trim() : undefined,
          }))
          .filter((q: OptionQuestion) => q.question)
      : [];
    if (questions.length) {
      return {
        question: typeof parsed?.title === 'string' ? parsed.title.trim() : '',
        choices: [],
        questions,
      };
    }

    const choices = normalizeChoices(parsed?.choices);
    if (!choices.length) return null;
    return {
      question: typeof parsed?.question === 'string' ? parsed.question.trim() : '',
      choices,
      ...(parsed?.acknowledge === true ? { acknowledge: true as const } : {}),
    };
  } catch {
    return null;
  }
}

const PAGE_SIZE = 4;

function choiceDisplayLabel(choice: OptionChoice): string {
  return choice.recommended ? `${choice.label} (empfohlen)` : choice.label;
}

/**
 * Quick-reply card shown above the chat input. Click a choice to send it
 * immediately; or type a custom answer in the card's own free-text field.
 * While this card is visible the main chat input is hidden — the card is the
 * single answer surface.
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
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [otherDraft, setOtherDraft] = useState('');

  // Reset to the first page when a new set of options arrives — adjust during render
  // (not in an effect) to avoid the setState-in-effect render cascade.
  const [syncedOptions, setSyncedOptions] = useState(options);
  if (options !== syncedOptions) {
    setSyncedOptions(options);
    setPage(0);
    setCustom('');
    setAnswers({});
    setQuestionIndex(0);
    setOtherDraft('');
  }

  const questions = options.questions ?? [];
  const isMulti = questions.length > 0;
  const total = options.choices.length;
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const visible = options.choices.slice(start, start + PAGE_SIZE);

  const handleCustom = (e: FormEvent) => {
    e.preventDefault();
    const text = custom.trim();
    if (!text) return;
    setCustom('');
    onCustomSubmit(text);
  };

  const buildMultiAnswer = (nextAnswers: Record<string, string>) => {
    const lines = questions
      .map(q => {
        const answer = (nextAnswers[q.id] || '').trim();
        return answer ? `${q.question}: ${answer}` : null;
      })
      .filter((line): line is string => !!line);
    return lines.join('\n');
  };

  const finishMulti = (nextAnswers: Record<string, string>) => {
    const text = buildMultiAnswer(nextAnswers);
    if (!text) return;
    setAnswers({});
    setOtherDraft('');
    onCustomSubmit(text);
  };

  const advanceMulti = (nextAnswers: Record<string, string>) => {
    setOtherDraft('');
    if (questionIndex >= questions.length - 1) {
      finishMulti(nextAnswers);
      return;
    }
    setQuestionIndex(i => Math.min(questions.length - 1, i + 1));
  };

  const answerCurrentQuestion = (answer: string) => {
    const question = questions[questionIndex];
    if (!question) return;
    const nextAnswers = { ...answers, [question.id]: answer };
    setAnswers(nextAnswers);
    advanceMulti(nextAnswers);
  };

  const submitMultiOther = (e: FormEvent) => {
    e.preventDefault();
    const text = otherDraft.trim();
    if (!text) return;
    answerCurrentQuestion(text);
  };

  const skipCurrentQuestion = () => {
    const question = questions[questionIndex];
    if (!question) return;
    const nextAnswers = { ...answers };
    delete nextAnswers[question.id];
    setAnswers(nextAnswers);
    advanceMulti(nextAnswers);
  };

  const submitMultiNow = () => {
    const text = buildMultiAnswer(answers);
    if (!text) return;
    finishMulti(answers);
  };

  if (options.acknowledge) {
    const choice = options.choices[0];
    return (
      <button
        type="button"
        onClick={() => onSelect(choice.label)}
        className="mb-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
      >
        {choice.label}
        <ArrowUp size={14} className="rotate-90" />
      </button>
    );
  }

  if (isMulti) {
    const currentQuestion = questions[Math.min(questionIndex, questions.length - 1)];
    const currentAnswer = currentQuestion ? answers[currentQuestion.id] : '';
    const hasAnyAnswer = Object.values(answers).some(value => value.trim());
    return (
      <div className="mb-2 rounded-2xl border border-gray-200 bg-white text-gray-800 shadow-md overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
          <span className="text-sm font-medium text-gray-800 line-clamp-2 leading-snug">
            {currentQuestion?.question || options.question || 'Kurz gefragt'}
          </span>
          <div className="flex shrink-0 items-center gap-1 text-xs text-gray-400">
            <button
              type="button"
              onClick={() => {
                setOtherDraft('');
                setQuestionIndex(i => Math.max(0, i - 1));
              }}
              disabled={questionIndex === 0}
              className="p-1 hover:text-gray-700 disabled:opacity-30 transition-colors"
              aria-label="Vorherige Frage"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="tabular-nums">
              {questionIndex + 1} von {questions.length}
            </span>
            <button
              type="button"
              onClick={skipCurrentQuestion}
              className="p-1 hover:text-gray-700 transition-colors"
              aria-label="Nächste Frage"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="ml-1 p-1 text-gray-400 hover:text-gray-700 transition-colors"
              aria-label="Schließen"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {currentQuestion ? (
          <>
            {currentQuestion.choices.length > 0 ? (
              <ul className="divide-y divide-gray-100">
                {currentQuestion.choices.map((choice, i) => (
                  <li key={choice.id}>
                    <button
                      type="button"
                      onClick={() => answerCurrentQuestion(choice.label)}
                      className={`group w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        currentAnswer === choice.label
                          ? 'bg-indigo-50/70'
                          : choice.recommended
                            ? 'bg-indigo-50/30 hover:bg-indigo-50/60'
                            : 'hover:bg-indigo-50/60'
                      }`}
                    >
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm tabular-nums transition-colors ${
                        currentAnswer === choice.label
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-500 group-hover:bg-indigo-100 group-hover:text-indigo-700'
                      }`}>
                        {i + 1}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-gray-800 line-clamp-2 leading-snug">
                          {choiceDisplayLabel(choice)}
                        </span>
                        {choice.detail && (
                          <span className="block text-xs text-gray-400 line-clamp-2">{choice.detail}</span>
                        )}
                      </span>
                      <ArrowUp
                        size={14}
                        className="shrink-0 rotate-90 text-gray-300 group-hover:text-indigo-500 transition-colors"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <form onSubmit={submitMultiOther} className="flex items-center gap-2 border-t border-gray-100 bg-gray-50/70 px-4 py-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gray-900 text-white">
                <Pencil size={14} />
              </span>
              <input
                value={otherDraft}
                onChange={e => setOtherDraft(e.target.value)}
                placeholder={currentQuestion.placeholder || (currentQuestion.choices.length ? 'Andere Antwort…' : 'Kurz antworten…')}
                className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!otherDraft.trim()}
                className="shrink-0 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-30"
              >
                Weiter
              </button>
              <button
                type="button"
                onClick={skipCurrentQuestion}
                className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-white hover:text-gray-800"
              >
                Skip
              </button>
            </form>
          </>
        ) : null}

        {questionIndex >= questions.length - 1 && hasAnyAnswer ? (
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
            <button
              type="button"
              onClick={submitMultiNow}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Antworten senden
              <ArrowUp size={14} strokeWidth={2.5} />
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mb-2 rounded-2xl border border-gray-200 bg-white text-gray-800 shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
        <span className="text-sm font-medium text-gray-800 line-clamp-2 leading-snug">
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
                className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 transition-colors"
                aria-label="Vorherige Optionen"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 transition-colors"
                aria-label="Weitere Optionen"
              >
                <ChevronRight size={16} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Choices */}
      <ul className="divide-y divide-gray-100">
        {visible.map((choice, i) => (
          <li key={choice.id}>
            <button
              type="button"
              onClick={() => onSelect(choice.label)}
              className={`group w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                choice.recommended ? 'bg-indigo-50/30 hover:bg-indigo-50/60' : 'hover:bg-indigo-50/60'
              }`}
            >
              <span className="shrink-0 w-5 text-sm tabular-nums text-gray-400 group-hover:text-indigo-500">
                {start + i + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-gray-800 line-clamp-2 leading-snug">
                  {choiceDisplayLabel(choice)}
                </span>
                {choice.detail && (
                  <span className="block text-xs text-gray-400 line-clamp-2">{choice.detail}</span>
                )}
              </span>
              <ArrowUp
                size={14}
                className="shrink-0 rotate-90 text-gray-300 group-hover:text-indigo-500 transition-colors"
              />
            </button>
          </li>
        ))}
      </ul>

      {/* Custom answer */}
      <form onSubmit={handleCustom} className="flex items-center gap-2 px-4 py-2.5 border-t border-gray-100 bg-gray-50/70">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gray-900 text-white">
          <Pencil size={14} />
        </span>
        <input
          value={custom}
          onChange={e => setCustom(e.target.value)}
          placeholder="Eigene Antwort…"
          className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!custom.trim()}
          className="shrink-0 w-7 h-7 flex items-center justify-center bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors disabled:opacity-30"
          aria-label="Eigene Antwort senden"
        >
          <ArrowUp size={14} strokeWidth={2.5} />
        </button>
      </form>
    </div>
  );
}
