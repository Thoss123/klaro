"use client"

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, Variants } from 'framer-motion';
import { Check, ArrowRight } from 'lucide-react';
import { Logo } from '@/components/Logo';

type Question = {
  id: string;
  type: 'choice' | 'info';
  title: string;
  options?: string[];
  infoText?: string;
  buttonText?: string;
};

const QUESTIONS: Question[] = [
  {
    id: 'ziel',
    type: 'choice',
    title: 'Was bringt dich hierher?',
    options: [
      'Ich will KI einsetzen aber weiß nicht wo anfangen',
      'Ich habe konkrete Ideen aber weiß nicht wie',
      'Ich will wissen ob KI für mich überhaupt sinnvoll ist',
      'Ich will meiner IT/Agentur ein klares Briefing geben'
    ]
  },
  {
    id: 'ki_erfahrung',
    type: 'choice',
    title: 'Habt ihr schon KI oder Automation im Einsatz?',
    options: [
      'Nein, komplettes Neuland',
      'Wir nutzen ChatGPT & Co. aber unsystematisch',
      'Wir haben einzelne Tools',
      'Wir haben schon Automationen laufen'
    ]
  },
  {
    id: 'wer_setzt_um',
    type: 'choice',
    title: 'Wer setzt das bei euch um?',
    options: [
      'Ich selbst',
      'Jemand intern (IT/Kollege)',
      'Externer Dienstleister',
      'Noch unklar'
    ]
  },
  {
    id: 'demo',
    type: 'info',
    title: 'So funktioniert der Coach',
    infoText: 'Wir nutzen das Prinzip des mäeutischen Gesprächs. Der Coach stellt gezielte Fragen, um deine Herausforderungen und Ziele genau zu erfassen. Daraus generiert er automatisch einen strukturierten KI-Einsatzplan für dich.',
    buttonText: 'Got it'
  },
  {
    id: 'hindernis',
    type: 'choice',
    title: 'Stimmt das für euch?',
    infoText: '„Wir wissen dass KI uns helfen könnte — aber ohne klaren Plan verlieren wir uns in Tools und Experimenten.“',
    options: [
      'Ja',
      'Manchmal',
      'Nein'
    ]
  },
  {
    id: 'tempo',
    type: 'choice',
    title: 'Wie schnell wollt ihr Ergebnisse?',
    options: [
      'Diese Woche erste Quick Wins',
      'Innerhalb eines Monats',
      'Wir planen langfristig'
    ]
  }
];

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const slideVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
    filter: 'blur(6px)',
  }),
  center: {
    x: 0,
    opacity: 1,
    filter: 'blur(0px)',
    transition: { duration: 0.45, ease: EASE_OUT },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -60 : 60,
    opacity: 0,
    filter: 'blur(6px)',
    transition: { duration: 0.3, ease: EASE_OUT },
  }),
};

export default function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [direction, setDirection] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const progress = ((step + 1) / QUESTIONS.length) * 100;
  const current = QUESTIONS[step];

  const handleNext = async (answer?: string) => {
    if (current.type === 'choice' && !answer) return;
    
    const newAnswers = { ...answers };
    if (answer) {
      newAnswers[current.id] = answer;
      setAnswers(newAnswers);
    }

    if (step === QUESTIONS.length - 1) {
      // Form submit
      setIsSubmitting(true);
      try {
        const res = await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newAnswers)
        });
        const data = await res.json();
        
        if (data.id) {
           localStorage.setItem('axantilo_session', JSON.stringify(newAnswers));
           localStorage.setItem('axantilo_session_id', data.id);
           router.push('/chat');
        } else {
           console.error("Fehler beim Speichern der Session:", data.error);
           setIsSubmitting(false);
        }
      } catch (e) {
        console.error(e);
        setIsSubmitting(false);
      }
    } else {
      setDirection(1);
      setStep(s => s + 1);
    }
  };

  const handleBack = () => {
    if (step === 0 || isSubmitting) return;
    setDirection(-1);
    setStep(s => s - 1);
  };

  return (
    <div className="flex flex-col min-h-screen antialiased bg-white text-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-6 lg:px-10">
        <div className="flex items-center gap-3">
          <Logo height={28} />
          <span className="text-lg font-bold tracking-tight text-slate-800">Coach</span>
        </div>

        <div className="hidden sm:block flex-1 max-w-md mx-auto">
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full"
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
            />
          </div>
          <div className="mt-2 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Schritt {step + 1} von {QUESTIONS.length}
          </div>
        </div>

        {step > 0 ? (
          <button
            onClick={handleBack}
            className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            aria-label="Zurück"
          >
            ←
          </button>
        ) : (
          <div className="w-10 h-10" />
        )}
      </div>

      {/* Main Area */}
      <div className="flex-1 flex items-center justify-center px-6 overflow-hidden relative">
        <div className="w-full max-w-2xl relative pb-20">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
             <motion.div
                key={current.id}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="w-full"
             >
                <div className="text-center mb-12">
                  <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl mb-6">
                    {current.title}
                  </h2>
                  {current.infoText && (
                    <p className="text-lg text-slate-600 max-w-xl mx-auto italic border-l-4 border-indigo-300 pl-5 py-3 bg-indigo-50/50 rounded-r-2xl">
                      {current.infoText}
                    </p>
                  )}
                </div>

                {current.type === 'info' ? (
                  <div className="flex justify-center mt-12">
                    <button
                      onClick={() => handleNext()}
                      disabled={isSubmitting}
                      className="rounded-full bg-slate-900 px-12 py-4 text-lg font-medium text-white transition hover:bg-slate-800 shadow-xl flex items-center gap-2"
                    >
                      {current.buttonText} <ArrowRight size={20} />
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-4 max-w-lg mx-auto">
                    {current.options?.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => handleNext(opt)}
                        disabled={isSubmitting}
                        className="group relative flex w-full items-center gap-5 rounded-2xl border px-6 py-5 text-left text-lg transition border-slate-200 bg-white hover:border-indigo-500 hover:shadow-md hover:bg-indigo-50/20"
                      >
                         <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-slate-300 bg-white group-hover:border-indigo-500 transition-colors">
                           <Check className="h-4 w-4 opacity-0 group-hover:opacity-100 text-indigo-600 transition-opacity" strokeWidth={3} />
                         </span>
                         <span className="flex-1 text-slate-700 group-hover:text-slate-900 font-medium">
                           {opt}
                         </span>
                      </button>
                    ))}
                  </div>
                )}
             </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
