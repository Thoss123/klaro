import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import { saveSupportRequest } from '@/lib/supabase-chat';

const CATEGORIES = [
  { value: 'bug', emoji: '🐞', label: 'Etwas funktioniert nicht' },
  { value: 'frage', emoji: '❓', label: 'Frage zur Bedienung' },
  { value: 'verbesserung', emoji: '💡', label: 'Verbesserungsvorschlag' },
  { value: 'sonstiges', emoji: '💬', label: 'Sonstiges' },
];

/**
 * Hilfe-Button-Modal: Problem melden. Step 1 Kategorie (One-Click) → Step 2
 * Freitext (Pflicht) → speichert in support_requests inkl. Kontext (Phase,
 * Session, Projekt, URL, User-Agent). Fail-soft.
 */
export default function SupportModal({
  sessionId,
  projectId,
  phase,
  onClose,
}: {
  sessionId: string | null;
  projectId: string | null;
  phase: string | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'category' | 'text' | 'thanks'>('category');
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (step !== 'thanks') return;
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [step, onClose]);

  const handleSelectCategory = (value: string) => {
    setCategory(value);
    setStep('text');
  };

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setIsSaving(true);
    await saveSupportRequest({
      sessionId,
      projectId,
      phase,
      category,
      message: trimmed,
      url: typeof window !== 'undefined' ? window.location.pathname : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    });
    setIsSaving(false);
    setStep('thanks');
  };

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
              <div className="text-4xl mb-3">✅</div>
              <p className="text-base font-semibold text-gray-800">
                Danke! Wir schauen uns das an.
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Deine Meldung ist bei uns angekommen.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-500">
                    Hilfe & Problem melden
                  </p>
                  <h2 className="text-base font-semibold text-gray-800 mt-0.5 leading-snug">
                    {step === 'category'
                      ? 'Worum geht es?'
                      : 'Beschreib dein Problem'}
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
                {step === 'category' ? (
                  <div className="flex flex-col gap-2">
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => handleSelectCategory(cat.value)}
                        className="flex items-center gap-3 rounded-lg border-2 border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-left text-sm text-gray-800 transition-all hover:border-indigo-400 hover:bg-indigo-100"
                      >
                        <span className="text-lg">{cat.emoji}</span>
                        {cat.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      rows={4}
                      autoFocus
                      placeholder="Beschreib so genau wie möglich, was passiert ist oder was du brauchst."
                      className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!message.trim() || isSaving}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isSaving && <Loader2 size={14} className="animate-spin" />}
                        Absenden
                      </button>
                      <button
                        type="button"
                        onClick={() => setStep('category')}
                        className="rounded-lg px-4 py-2.5 text-sm text-gray-400 transition-colors hover:text-gray-700"
                      >
                        Zurück
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
