'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, CheckCircle2, X } from 'lucide-react';
import { joinMultiValue, parseMultiValue, toggleMultiValue } from '@/lib/onboarding-multi';
import {
  clearWaitlistSessionToken,
  getOrCreateWaitlistSessionToken,
  saveWaitlistSignup,
} from '@/lib/waitlist-client';
import type { WaitlistFormData } from '@/lib/waitlist-types';

type WizardOption = { label: string; value: string };

const PROZESS_OTHER = 'Sonstiges';

const PROZESS_OPTIONS: WizardOption[] = [
  { label: 'Anfragen sofort beantworten (Portale, E-Mail)', value: 'Anfragen-Autopilot' },
  { label: 'Exposés automatisch erstellen', value: 'Exposé-Generator' },
  { label: 'Follow-ups nach Besichtigungen', value: 'Besichtigungs-Follow-up' },
  { label: 'Interessenten-Matching bei neuen Objekten', value: 'Interessenten-Matching' },
  { label: 'Ads & Social Media für Objekte', value: 'Ads & Social Media' },
  { label: 'Digitale Rundgänge & Terminbuchung', value: 'Digitale Rundgänge' },
  { label: 'Rechnung & Provision nach Abschluss', value: 'Rechnung & Provision' },
  { label: 'Eigentümer-Reporting & Onboarding', value: 'Eigentümer-Reporting' },
  { label: 'Etwas anderes', value: PROZESS_OTHER },
];

const GROESSE_OPTIONS: WizardOption[] = [
  { label: 'Nur ich — Solo-Makler', value: 'solo' },
  { label: 'Kleines Büro: 2–5 Mitarbeiter', value: 'small' },
  { label: 'Wachsendes Team: 6–20 Mitarbeiter', value: 'medium' },
  { label: 'Mittelstand: 21–50 Mitarbeiter', value: 'large' },
  { label: 'Größerer Betrieb: mehr als 50 Mitarbeiter', value: 'large_plus' },
];

const TOOL_OPTIONS: WizardOption[] = [
  { label: 'justimmo', value: 'justimmo' },
  { label: 'onOffice', value: 'onOffice' },
  { label: 'ImmoScout24', value: 'ImmoScout24' },
  { label: 'willhaben', value: 'willhaben' },
  { label: 'Gmail / Google Kalender', value: 'Google' },
  { label: 'Outlook / Microsoft 365', value: 'Microsoft' },
  { label: 'WhatsApp Business', value: 'WhatsApp Business' },
  { label: 'Meta Ads', value: 'Meta Ads' },
  { label: 'Noch keins / weiß ich nicht', value: 'Unklar' },
];

const TOTAL_STEPS = 5;
const ACCENT = 'bg-[#2F6BFF]';
const ACCENT_HOVER = 'hover:bg-[#2558d9]';
const ACCENT_BORDER = 'border-[#2F6BFF]';
const ACCENT_BG = 'bg-[#2F6BFF]/10';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function WaitlistWizard({
  embedded = false,
  onClose,
}: {
  embedded?: boolean;
  onClose?: () => void;
}) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WaitlistFormData>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const dataRef = useRef(data);
  const stepRef = useRef(step);
  const completedRef = useRef(completed);

  useEffect(() => {
    getOrCreateWaitlistSessionToken();
  }, []);

  useEffect(() => {
    dataRef.current = data;
    stepRef.current = step;
    completedRef.current = completed;
  }, [data, step, completed]);

  const persist = useCallback(
    async (nextStep: number, patch: Partial<WaitlistFormData> = {}, status: 'partial' | 'completed' | 'abandoned' = 'partial') => {
      const merged = { ...dataRef.current, ...patch };
      setData(merged);
      dataRef.current = merged;
      await saveWaitlistSignup(nextStep, merged, { status });
    },
    [],
  );

  const flushAbandoned = useCallback(() => {
    if (completedRef.current) return;
    void saveWaitlistSignup(stepRef.current, dataRef.current, {
      status: 'abandoned',
      beacon: true,
    });
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', flushAbandoned);
    return () => {
      window.removeEventListener('pagehide', flushAbandoned);
      flushAbandoned();
    };
  }, [flushAbandoned]);

  const nextStep = async (patch: Partial<WaitlistFormData> = {}) => {
    const merged = { ...dataRef.current, ...patch };
    setData(merged);
    dataRef.current = merged;
    const upcoming = Math.min(stepRef.current + 1, TOTAL_STEPS);
    await persist(upcoming, merged, 'partial');
    setStep(upcoming);
  };

  const prevStep = () => setStep((s) => Math.max(1, s - 1));

  const updateField = (field: keyof WaitlistFormData, value: string) => {
    setData((prev) => {
      const next = { ...prev, [field]: value };
      dataRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    if (step !== 4 || completed) return;
    const timer = window.setTimeout(() => {
      void saveWaitlistSignup(4, dataRef.current, { status: 'partial' });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [data, step, completed]);

  const handleSubmit = async () => {
    const email = (data.email || '').trim();
    const vorname = (data.vorname || '').trim();
    const firmenname = (data.firmenname || '').trim();

    if (!vorname || !firmenname || !isValidEmail(email)) {
      setSubmitError('Bitte Vorname, Firmenname und eine gültige E-Mail ausfüllen.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      ...data,
      vorname,
      firmenname,
      email,
      telefon: (data.telefon || '').trim() || undefined,
    };

    const result = await saveWaitlistSignup(5, payload, { status: 'completed' });
    if (!result.ok) {
      setSubmitError('Speichern fehlgeschlagen — bitte kurz erneut versuchen.');
      setSubmitting(false);
      return;
    }

    setCompleted(true);
    completedRef.current = true;
    clearWaitlistSessionToken();
    setStep(5);
    setSubmitting(false);
  };

  const currentQuestion = () => {
    switch (step) {
      case 1:
        return (
          <QuestionStep
            title="Welchen Prozess würdest du gerne automatisieren?"
            subtitle="Mehrere Antworten möglich — wähle alles, was bei dir am meisten Zeit frisst."
            options={PROZESS_OPTIONS}
            value={data.prozesse}
            mode="multi"
            otherOptionValue={PROZESS_OTHER}
            otherInputLabel="Was soll Axantilo für dich übernehmen?"
            otherInputPlaceholder="z. B. Objekt-Fotos sortieren, Eigentümer-Updates"
            onSelect={(v) => updateField('prozesse', v)}
            onNext={() => nextStep()}
            isFirst
          />
        );
      case 2:
        return (
          <QuestionStep
            title="Wie groß ist dein Maklerbüro?"
            subtitle="Hilft uns, passende Workflows und Testplätze zuzuordnen."
            options={GROESSE_OPTIONS}
            value={data.unternehmensgroesse}
            onSelect={(v) => updateField('unternehmensgroesse', v)}
            onNext={() => nextStep()}
            onBack={prevStep}
          />
        );
      case 3:
        return (
          <QuestionStep
            title="Welche Tools nutzt du heute?"
            subtitle="Axantilo orchestriert deinen Stack — nichts muss ersetzt werden."
            options={TOOL_OPTIONS}
            value={data.tools}
            mode="multi"
            onSelect={(v) => updateField('tools', v)}
            onNext={() => nextStep()}
            onBack={prevStep}
          />
        );
      case 4:
        return (
          <ContactStep
            data={data}
            onChange={updateField}
            onBack={prevStep}
            onSubmit={handleSubmit}
            submitting={submitting}
            error={submitError}
          />
        );
      case 5:
        return (
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="w-16 h-16 rounded-full bg-[#2F6BFF]/15 flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9 text-[#2F6BFF]" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Du bist auf der Warteliste!</h2>
              <p className="text-gray-500 max-w-md mx-auto leading-relaxed">
                Danke{data.vorname ? `, ${data.vorname}` : ''}. Wir melden uns an{' '}
                <strong className="text-gray-700">{data.email}</strong>, sobald ein Testplatz frei wird —
                in der Regel innerhalb von 24 Stunden.
              </p>
            </div>
            {embedded && onClose ? (
              <button
                type="button"
                onClick={onClose}
                className={`inline-flex items-center justify-center gap-2 ${ACCENT} ${ACCENT_HOVER} text-white font-semibold px-6 py-3.5 rounded-xl transition-colors`}
              >
                Zurück zur Startseite
              </button>
            ) : (
              <Link
                href="/"
                className={`inline-flex items-center justify-center gap-2 ${ACCENT} ${ACCENT_HOVER} text-white font-semibold px-6 py-3.5 rounded-xl transition-colors`}
              >
                Zurück zur Startseite
              </Link>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="w-full p-6 flex items-center justify-between max-w-xl mx-auto">
        {embedded && onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors"
          >
            ← Axantilo
          </button>
        ) : (
          <Link href="/" className="text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors">
            ← Axantilo
          </Link>
        )}
        <div className="flex items-center gap-3">
          {!completed && (
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              Warteliste · Schritt {Math.min(step, 4)} / 4
            </span>
          )}
          {embedded && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Schließen"
              className="w-9 h-9 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-gray-900 flex items-center justify-center"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </header>

      {!completed && step <= 4 && (
        <div className="w-full px-6 flex items-center justify-center">
          <div className="flex gap-1.5">
            {Array.from({ length: 4 }, (_, i) => i + 1).map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (i < step) setStep(i);
                }}
                disabled={i >= step}
                aria-label={`Schritt ${i}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step
                    ? `w-8 ${ACCENT}`
                    : i < step
                      ? 'w-4 bg-[#2F6BFF]/30 hover:bg-[#2F6BFF]/50 cursor-pointer'
                      : 'w-4 bg-gray-200 cursor-default'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center p-6 pb-32">
        <div className="w-full max-w-xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {currentQuestion()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function QuestionStep({
  title,
  subtitle,
  options,
  value,
  onSelect,
  onNext,
  onBack,
  isFirst = false,
  mode = 'single',
  autoAdvance = false,
  otherOptionValue,
  otherInputLabel,
  otherInputPlaceholder,
}: {
  title: string;
  subtitle?: string;
  options: WizardOption[];
  value?: string;
  onSelect: (v: string) => void;
  onNext: () => void;
  onBack?: () => void;
  isFirst?: boolean;
  mode?: 'single' | 'multi';
  autoAdvance?: boolean;
  otherOptionValue?: string;
  otherInputLabel?: string;
  otherInputPlaceholder?: string;
}) {
  const isMulti = mode === 'multi';
  const selectedValues = parseMultiValue(value);
  const standardValues = options.map((o) => o.value);
  const hasOtherOption = Boolean(otherOptionValue);
  const isOtherSelected = hasOtherOption && selectedValues.includes(otherOptionValue!);
  const customOtherValue = parseMultiValue(value).find(
    (v) => v !== otherOptionValue && !standardValues.includes(v),
  );
  const isOtherActive = isMulti
    ? isOtherSelected || Boolean(customOtherValue)
    : hasOtherOption &&
      (value === otherOptionValue || Boolean(customOtherValue));
  const [otherDraft, setOtherDraft] = useState('');

  // Freitext mit gespeichertem Custom-Wert synchron halten.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (isMulti && customOtherValue) {
      setOtherDraft(customOtherValue);
    } else if (isMulti && !isOtherSelected) {
      setOtherDraft('');
    } else if (!isMulti && customOtherValue) {
      setOtherDraft(customOtherValue);
    }
  }

  const handleSelect = (opt: WizardOption) => {
    if (isMulti) {
      const next = toggleMultiValue(value, opt.value);
      onSelect(next);
      if (otherOptionValue && opt.value === otherOptionValue && parseMultiValue(next).includes(otherOptionValue)) {
        setOtherDraft('');
      }
      if (otherOptionValue && opt.value === otherOptionValue && !parseMultiValue(next).includes(otherOptionValue)) {
        const withoutCustom = parseMultiValue(next).filter((v) => standardValues.includes(v));
        onSelect(joinMultiValue(withoutCustom));
        setOtherDraft('');
      }
    } else if (hasOtherOption && opt.value === otherOptionValue) {
      onSelect(opt.value);
    } else {
      onSelect(opt.value);
      if (autoAdvance) {
        setTimeout(() => onNext(), 180);
      } else {
        setTimeout(() => onNext(), 180);
      }
    }
  };

  const handleOtherContinue = () => {
    const trimmed = otherDraft.trim();
    if (!trimmed) return;

    if (isMulti && otherOptionValue) {
      const kept = parseMultiValue(value).filter(
        (v) => v !== otherOptionValue && standardValues.includes(v),
      );
      onSelect(joinMultiValue([...kept, trimmed]));
    } else {
      onSelect(trimmed);
    }
    onNext();
  };

  const handleMultiNext = () => {
    if (isOtherActive) {
      handleOtherContinue();
      return;
    }
    onNext();
  };

  const otherReady = otherDraft.trim().length > 0;
  const canContinueMulti = selectedValues.length > 0 && (!isOtherActive || otherReady);

  return (
    <div className="flex flex-col gap-8">
      {!isFirst && onBack && (
        <div className="flex justify-center mb-[-1rem]">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors bg-white px-4 py-1.5 rounded-full border border-gray-100 shadow-sm"
          >
            <ArrowLeft size={16} /> Zurück
          </button>
        </div>
      )}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 leading-tight mb-2">{title}</h2>
        {subtitle && <p className="text-gray-500 text-base max-w-md mx-auto">{subtitle}</p>}
      </div>
      <div className="flex flex-col gap-3">
        {options.map((opt) => {
          const isSelected = isMulti
            ? selectedValues.includes(opt.value) ||
              (opt.value === otherOptionValue && Boolean(customOtherValue))
            : hasOtherOption && opt.value === otherOptionValue
              ? isOtherActive
              : value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelect(opt)}
              className={`p-5 text-left border-2 rounded-2xl transition-all duration-200 hover:border-[#2F6BFF]/60 hover:bg-[#2F6BFF]/10 hover:shadow-sm flex items-start gap-4 ${
                isSelected ? `${ACCENT_BORDER} ${ACCENT_BG}` : 'border-gray-200 bg-white'
              }`}
            >
              <div
                className={`w-6 h-6 mt-0.5 shrink-0 flex items-center justify-center border-2 transition-colors ${
                  isMulti ? 'rounded-md' : 'rounded-full'
                } ${isSelected ? `${ACCENT_BORDER} ${ACCENT}` : 'border-gray-300'}`}
              >
                {isSelected &&
                  (isMulti ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-4 h-4 text-white">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <div className="w-2.5 h-2.5 rounded-full bg-white" />
                  ))}
              </div>
              <span className={`text-base font-medium leading-snug ${isSelected ? 'text-[#1e40af]' : 'text-gray-700'}`}>
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>

      {hasOtherOption && isOtherActive && (
        <div className="flex flex-col gap-3 -mt-2">
          {otherInputLabel && <p className="text-sm font-medium text-gray-600 text-center">{otherInputLabel}</p>}
          <input
            type="text"
            value={otherDraft}
            onChange={(e) => setOtherDraft(e.target.value)}
            placeholder={otherInputPlaceholder}
            className="w-full px-5 py-4 text-lg border-2 border-gray-200 rounded-2xl focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/20 outline-none transition-all"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && otherReady) handleOtherContinue();
            }}
          />
        </div>
      )}

      {(isMulti || (hasOtherOption && isOtherActive)) && (
        <button
          type="button"
          onClick={isMulti ? handleMultiNext : isOtherActive ? handleOtherContinue : onNext}
          disabled={isMulti ? !canContinueMulti : isOtherActive ? !otherReady : selectedValues.length === 0}
          className={`w-full ${ACCENT} ${ACCENT_HOVER} text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Weiter <ArrowRight size={20} />
        </button>
      )}
    </div>
  );
}

function ContactStep({
  data,
  onChange,
  onBack,
  onSubmit,
  submitting,
  error,
}: {
  data: WaitlistFormData;
  onChange: (field: keyof WaitlistFormData, value: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const canSubmit =
    (data.vorname || '').trim().length > 0 &&
    (data.firmenname || '').trim().length > 0 &&
    isValidEmail(data.email || '');

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-center mb-[-1rem]">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors bg-white px-4 py-1.5 rounded-full border border-gray-100 shadow-sm"
        >
          <ArrowLeft size={16} /> Zurück
        </button>
      </div>
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 leading-tight mb-2">Wie erreichen wir dich?</h2>
        <p className="text-gray-500 text-base max-w-md mx-auto">
          Trag deine Kontaktdaten ein — wir melden uns, sobald ein Testplatz frei wird.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-600">Vorname</span>
          <input
            type="text"
            value={data.vorname || ''}
            onChange={(e) => onChange('vorname', e.target.value)}
            placeholder="z. B. Thomas"
            className="w-full px-5 py-4 text-lg border-2 border-gray-200 rounded-2xl focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/20 outline-none transition-all"
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-600">Maklerbüro / Firma</span>
          <input
            type="text"
            value={data.firmenname || ''}
            onChange={(e) => onChange('firmenname', e.target.value)}
            placeholder="z. B. Mustermann Immobilien"
            className="w-full px-5 py-4 text-lg border-2 border-gray-200 rounded-2xl focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/20 outline-none transition-all"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-600">E-Mail</span>
          <input
            type="email"
            value={data.email || ''}
            onChange={(e) => onChange('email', e.target.value)}
            placeholder="du@maklerbuero.at"
            className="w-full px-5 py-4 text-lg border-2 border-gray-200 rounded-2xl focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/20 outline-none transition-all"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-600">
            Telefon <span className="text-gray-400 font-normal">(optional)</span>
          </span>
          <input
            type="tel"
            value={data.telefon || ''}
            onChange={(e) => onChange('telefon', e.target.value)}
            placeholder="+43 …"
            className="w-full px-5 py-4 text-lg border-2 border-gray-200 rounded-2xl focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/20 outline-none transition-all"
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-600 text-center">{error}</p>}

      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit || submitting}
        className={`w-full ${ACCENT} ${ACCENT_HOVER} text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {submitting ? 'Wird gesendet …' : 'Auf die Warteliste'}
        {!submitting && <ArrowRight size={20} />}
      </button>

      <p className="text-xs text-gray-400 text-center leading-relaxed">
        Mit dem Absenden stimmst du zu, dass wir dich zur Testphase kontaktieren. Deine Daten werden DSGVO-konform
        verarbeitet.
      </p>
    </div>
  );
}
