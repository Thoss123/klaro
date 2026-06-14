import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export type PhaseFeedbackData = {
  satisfaction: string;
  helpfulness: string;
  comment?: string;
};

const PHASE_LABELS: Record<string, string> = {
  diagnose: 'Diagnose',
  analyse: 'Analyse',
  plan: 'Plan',
  umsetzung: 'Umsetzung',
};

const SATISFACTION_OPTIONS = [
  { value: 'schlecht', emoji: '😞', label: 'Schlecht' },
  { value: 'geht_so', emoji: '😐', label: 'Geht so' },
  { value: 'gut', emoji: '🙂', label: 'Gut' },
  { value: 'top', emoji: '😍', label: 'Top' },
];

const HELPFULNESS_OPTIONS = [
  { value: 'sehr', label: 'Ja, sehr' },
  { value: 'teilweise', label: 'Teilweise' },
  { value: 'nicht', label: 'Nicht wirklich' },
];

/**
 * Phasen-Feedback-Popup ("Wie hat es dir gefallen?"). Erscheint, sobald eine
 * Phase abgeschlossen ist. One-Click-Steps: Zufriedenheit → Nutzen → optionaler
 * Freitext → Danke. Gespeichert wird erst am Ende via onSubmit.
 */
export default function PhaseFeedbackModal({
  phase,
  isFinal,
  onSubmit,
  onClose,
}: {
  phase: string;
  isFinal: boolean;
  onSubmit: (data: PhaseFeedbackData) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'satisfaction' | 'helpfulness' | 'text' | 'thanks'>(
    'satisfaction',
  );
  const [satisfaction, setSatisfaction] = useState('');
  const [helpfulness, setHelpfulness] = useState('');
  const [comment, setComment] = useState('');

  const phaseLabel = PHASE_LABELS[phase] || 'dieser Phase';

  const title = isFinal
    ? 'Geschafft! 🎉'
    : `Phase „${phaseLabel}" abgeschlossen`;

  const satisfactionQuestion = isFinal
    ? 'Wie war deine Gesamterfahrung mit Klaro?'
    : `Wie hat dir die Phase „${phaseLabel}" gefallen?`;

  const helpfulnessQuestion = isFinal
    ? 'Hat dich Klaro insgesamt weitergebracht?'
    : 'Hat dich Klaro in dieser Phase weitergebracht?';

  useEffect(() => {
    if (step !== 'thanks') return;
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [step, onClose]);

  const handleSelectSatisfaction = (value: string) => {
    setSatisfaction(value);
    setStep('helpfulness');
  };

  const handleSelectHelpfulness = (value: string) => {
    setHelpfulness(value);
    setStep('text');
  };

  const finish = (finalComment: string) => {
    onSubmit({ satisfaction, helpfulness, comment: finalComment.trim() || undefined });
    setStep('thanks');
  };

  const stepHeader =
    step === 'satisfaction'
      ? satisfactionQuestion
      : step === 'helpfulness'
        ? helpfulnessQuestion
        : 'Was können wir besser machen? (optional)';

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {step === 'thanks' ? (
            <div className="px-6 py-10 text-center">
              <div className="text-4xl mb-3">🙏</div>
              <p className="text-base font-semibold text-gray-800">
                Danke für dein Feedback!
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Das hilft uns, Klaro besser zu machen.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-500">
                    {title}
                  </p>
                  <h2 className="text-base font-semibold text-gray-800 mt-0.5 leading-snug">
                    {stepHeader}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 p-1 text-gray-400 hover:text-gray-700 transition-colors"
                  aria-label="Schließen"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-5 py-5">
                {step === 'satisfaction' && (
                  <div className="grid grid-cols-4 gap-2">
                    {SATISFACTION_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleSelectSatisfaction(opt.value)}
                        className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-indigo-200 bg-indigo-50 py-3 transition-all hover:border-indigo-400 hover:bg-indigo-100"
                      >
                        <span className="text-2xl">{opt.emoji}</span>
                        <span className="text-[11px] font-medium text-gray-700">
                          {opt.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {step === 'helpfulness' && (
                  <div className="flex flex-col gap-2">
                    {HELPFULNESS_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleSelectHelpfulness(opt.value)}
                        className="flex items-center gap-2.5 rounded-lg border-2 border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-left text-sm text-gray-800 transition-all hover:border-indigo-400 hover:bg-indigo-100"
                      >
                        <span className="w-4 h-4 shrink-0 rounded-full border-2 border-indigo-400 bg-indigo-200" />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}

                {step === 'text' && (
                  <>
                    <textarea
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      rows={4}
                      autoFocus
                      placeholder="Was lief gut, was hat gefehlt? (optional)"
                      className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => finish(comment)}
                        className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                      >
                        Senden
                      </button>
                      <button
                        type="button"
                        onClick={() => finish('')}
                        className="rounded-lg px-4 py-2.5 text-sm text-gray-400 transition-colors hover:text-gray-700"
                      >
                        Überspringen
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
