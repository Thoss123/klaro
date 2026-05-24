"use client"

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import AuthForm from '@/components/auth/AuthForm';
import { OnboardingData } from '@/lib/types';
import { useRouter } from 'next/navigation';

const BRANCHE_OPTIONS = ['Steuerberatung', 'Handwerk', 'E-Commerce', 'Agentur', 'Beratung', 'Immobilien', 'Sonstiges'];
const GROESSE_OPTIONS = ['Solo', '2–5', '6–20', '21–50', '50+'];
const ERFAHRUNG_OPTIONS = ['Komplettes Neuland', 'Haben schon damit rumgespielt', 'Nutzen es regelmäßig aber unsystematisch', 'Haben schon Workflows im Einsatz'];
const ZIEL_OPTIONS = ['Zeit sparen bei repetitiven Aufgaben', 'Mehr Umsatz durch bessere Prozesse', 'Wissen besser nutzen', 'Kosten senken', 'Bin noch unsicher'];
const UMSETZER_OPTIONS = ['Ich selbst', 'Jemand intern', 'Externer Dienstleister', 'Noch unklar'];
const HINDERNIS_OPTIONS = ['Keine Zeit uns damit zu beschäftigen', 'Fehlendes Know-How intern', 'Unsicherheit wegen Datenschutz', 'Wir wissen nicht, wo wir anfangen sollen', 'Bisher keine passenden Tools gefunden'];
const TEMPO_OPTIONS = ['Diese Woche', 'Innerhalb eines Monats', 'Kein Zeitdruck'];

export default function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Partial<OnboardingData>>({});

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  const updateData = (field: keyof OnboardingData, value: string) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const handleAuthSuccess = () => {
    // Save onboarding data to localstorage temporarily so chat page can pick it up
    // In a real app we might pass it via query params or a global state store
    const intro = localStorage.getItem('klaro_intro_message');
    const payload = intro ? { ...data, intro_message: intro } : data;
    localStorage.setItem('pending_onboarding', JSON.stringify(payload));
    localStorage.removeItem('klaro_intro_message');
    router.push('/chat?new=true');
  };

  const currentQuestion = () => {
    switch (step) {
      case 1:
        return (
          <QuestionStep 
            title="In welcher Branche bist du unterwegs?"
            options={BRANCHE_OPTIONS}
            value={data.branche}
            onSelect={(v) => updateData('branche', v)}
            onNext={nextStep}
            onBack={prevStep}
            isFirst={true}
          />
        );
      case 2:
        return (
          <QuestionStep 
            title="Wie groß ist dein Team?"
            options={GROESSE_OPTIONS}
            value={data.unternehmensgroesse}
            onSelect={(v) => updateData('unternehmensgroesse', v)}
            onNext={nextStep}
            onBack={prevStep}
          />
        );
      case 3:
        return (
          <QuestionStep 
            title="Wie sieht's bei euch mit KI aus?"
            options={ERFAHRUNG_OPTIONS}
            value={data.ki_erfahrung}
            onSelect={(v) => updateData('ki_erfahrung', v)}
            onNext={nextStep}
            onBack={prevStep}
          />
        );
      case 4:
        return (
          <QuestionStep 
            title="Was willst du mit KI erreichen?"
            options={ZIEL_OPTIONS}
            value={data.ziel}
            onSelect={(v) => updateData('ziel', v)}
            onNext={nextStep}
            onBack={prevStep}
            isMultiSelect={true}
          />
        );
      case 5:
        return (
          <QuestionStep 
            title="Wer würde KI-Lösungen bei euch umsetzen?"
            options={UMSETZER_OPTIONS}
            value={data.wer_setzt_um}
            onSelect={(v) => updateData('wer_setzt_um', v)}
            onNext={nextStep}
            onBack={prevStep}
          />
        );
      case 6:
        return (
          <QuestionStep 
            title="Was hat euch bisher davon abgehalten loszulegen?"
            options={HINDERNIS_OPTIONS}
            value={data.hindernis}
            onSelect={(v) => updateData('hindernis', v)}
            onNext={nextStep}
            onBack={prevStep}
          />
        );
      case 7:
        return (
          <QuestionStep 
            title="Wie schnell wollt ihr Ergebnisse sehen?"
            options={TEMPO_OPTIONS}
            value={data.tempo}
            onSelect={(v) => updateData('tempo', v)}
            onNext={nextStep}
            onBack={prevStep}
          />
        );
      case 8:
        return (
          <div className="flex flex-col gap-4">
             <div className="text-center mb-6">
               <h2 className="text-3xl font-bold text-gray-900 mb-2">Fast geschafft!</h2>
               <p className="text-gray-500">Erstelle einen Account, um deine Roadmap und Chats zu speichern.</p>
             </div>
             <AuthForm onSuccess={handleAuthSuccess} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header / Progress */}
      <div className="w-full p-6 flex items-center justify-center relative">
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <button 
              key={i}
              onClick={() => { if (i < step) setStep(i); }}
              disabled={i >= step}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-indigo-600' : i < step ? 'w-4 bg-indigo-200 hover:bg-indigo-300 cursor-pointer' : 'w-4 bg-gray-200 cursor-default'}`} 
            />
          ))}
        </div>
      </div>

      {/* Main Content */}
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

function QuestionStep({ title, options, value, onSelect, onNext, onBack, isMultiSelect = false, isFirst = false }: { title: string, options: string[], value?: string, onSelect: (v: string) => void, onNext: () => void, onBack: () => void, isMultiSelect?: boolean, isFirst?: boolean }) {
  const selectedValues = value ? value.split(', ').filter(Boolean) : [];

  const handleSelect = (opt: string) => {
    if (isMultiSelect) {
      if (selectedValues.includes(opt)) {
        onSelect(selectedValues.filter(v => v !== opt).join(', '));
      } else {
        onSelect([...selectedValues, opt].join(', '));
      }
    } else {
      onSelect(opt);
      // Let React update the state briefly before advancing for a better UX feeling
      setTimeout(() => onNext(), 150);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {!isFirst && (
        <div className="flex justify-center mb-[-1rem]">
          <button 
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors bg-white px-4 py-1.5 rounded-full border border-gray-100 shadow-sm"
          >
            <ArrowLeft size={16} /> Zurück
          </button>
        </div>
      )}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 leading-tight mb-2">{title}</h2>
        {isMultiSelect && <p className="text-gray-500 text-sm">Mehrfachauswahl möglich</p>}
      </div>
      <div className="flex flex-col gap-3">
        {options.map(opt => {
          const isSelected = selectedValues.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              className={`p-5 text-left border-2 rounded-2xl transition-all duration-200 text-lg font-medium hover:border-indigo-400 hover:bg-indigo-50 hover:shadow-sm flex items-center gap-4 ${
                isSelected ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-700'
              }`}
            >
              <div className={`w-6 h-6 shrink-0 flex items-center justify-center border-2 transition-colors ${isMultiSelect ? 'rounded-md' : 'rounded-full'} ${isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'}`}>
                {isSelected && (
                   isMultiSelect ? 
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-4 h-4 text-white"><polyline points="20 6 9 17 4 12"></polyline></svg>
                   : 
                   <div className="w-2.5 h-2.5 rounded-full bg-white"></div>
                )}
              </div>
              {opt}
            </button>
          );
        })}
      </div>
      
      {isMultiSelect && (
        <div className="mt-2 flex justify-center">
          <button 
            onClick={onNext}
            disabled={selectedValues.length === 0}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Weiter <ArrowRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
