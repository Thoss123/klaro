import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const DOWN_OPTIONS = [
  'Antwort war falsch oder ungenau',
  'Hat meine Frage nicht beantwortet',
  'Zu kompliziert erklärt',
  'Zu lang / zu viel Text',
  'Anleitung funktioniert nicht',
  'Sonstiges',
];

const UP_OPTIONS = [
  'Genau meine Frage beantwortet',
  'Verständlich erklärt',
  'Hilfreiche Schritt-für-Schritt-Anleitung',
  'Schnell auf den Punkt',
  'Sonstiges',
];

/**
 * Mini-Umfrage unter einer bewerteten Coach-Nachricht.
 * Schritt 1: Choose-1 → Klick speichert sofort + springt zu Freitext.
 * Schritt 2: optionaler Freitext mit Senden/Überspringen.
 * Daumen + Auswahl sind sofort gespeichert.
 */
export default function MessageFeedbackSurvey({
  rating,
  onSaveProblem,
  onSaveComment,
  onDone,
}: {
  rating: 'up' | 'down';
  onSaveProblem: (problem: string) => void;
  onSaveComment: (comment: string) => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<'choose' | 'text' | 'thanks'>('choose');
  const [text, setText] = useState('');

  const options = rating === 'down' ? DOWN_OPTIONS : UP_OPTIONS;
  const question =
    rating === 'down' ? 'Was genau war das Problem?' : 'Was war besonders gut?';

  useEffect(() => {
    if (step !== 'thanks') return;
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [step, onDone]);

  const handleSelectChoice = (option: string) => {
    onSaveProblem(option);
    setStep('text');
  };

  const handleSendText = () => {
    const trimmed = text.trim();
    if (trimmed) onSaveComment(trimmed);
    setStep('thanks');
  };

  if (step === 'thanks') {
    return (
      <div className="mt-2 max-w-sm rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm text-gray-600">
        Danke für dein Feedback! 🙏
      </div>
    );
  }

  return (
    <div className="mt-2 max-w-sm rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-gray-100 bg-gray-50/60">
        <span className="text-xs font-medium text-gray-700">
          {step === 'choose' ? question : 'Magst du es genauer beschreiben? (optional)'}
        </span>
        <button
          type="button"
          onClick={onDone}
          className="p-0.5 text-gray-400 hover:text-gray-700 transition-colors"
          aria-label="Schließen"
        >
          <X size={14} />
        </button>
      </div>

      {step === 'choose' ? (
        <div className="p-2.5">
          <div className="flex flex-col gap-1.5">
            {options.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => handleSelectChoice(opt)}
                className="flex items-center gap-2.5 rounded-lg border-2 border-indigo-200 bg-indigo-50 px-3 py-2 text-left text-xs text-gray-800 transition-all hover:border-indigo-400 hover:bg-indigo-100"
              >
                <span className="w-3.5 h-3.5 shrink-0 rounded-full border-2 border-indigo-400 bg-indigo-200" />
                {opt}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-2.5">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            autoFocus
            placeholder={
              rating === 'down'
                ? 'Was hättest du dir stattdessen gewünscht?'
                : 'Was hat dir geholfen?'
            }
            className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-800 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSendText}
              disabled={!text.trim()}
              className="flex-1 rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Senden
            </button>
            <button
              type="button"
              onClick={() => setStep('thanks')}
              className="rounded-lg px-3 py-2 text-xs text-gray-400 transition-colors hover:text-gray-700"
            >
              Überspringen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
