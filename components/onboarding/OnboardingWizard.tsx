"use client"

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import AuthForm from '@/components/auth/AuthForm';
import OnboardingExistingAccount from '@/components/onboarding/OnboardingExistingAccount';
import { OnboardingData } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { ensureDefaultProject, createProject, createSession } from '@/lib/supabase-chat';
import { parseMultiValue, toggleMultiValue } from '@/lib/onboarding-multi';

type WizardOption = { label: string; value: string };

const BRANCHE_OTHER_VALUE = 'Sonstiges';

function isCustomOptionValue(
  value: string | undefined,
  options: WizardOption[],
  otherValue: string,
): boolean {
  if (!value || value === otherValue) return false;
  const standard = options.map((o) => o.value).filter((v) => v !== otherValue);
  return !standard.includes(value);
}

const BRANCHE_OPTIONS: WizardOption[] = [
  { label: 'Steuerberatung & Wirtschaftsprüfung', value: 'Steuerberatung' },
  { label: 'Handwerk & Produktion', value: 'Handwerk' },
  { label: 'E-Commerce & Online-Handel', value: 'E-Commerce' },
  { label: 'Marketing-, Kreativ- oder Digitalagentur', value: 'Agentur' },
  { label: 'Beratung & professionelle Dienstleistung', value: 'Beratung' },
  { label: 'Immobilien', value: 'Immobilien' },
  { label: 'Andere Branche', value: BRANCHE_OTHER_VALUE },
];

const GROESSE_OPTIONS: WizardOption[] = [
  { label: 'Nur ich — Selbstständig oder Freelancer', value: 'solo' },
  { label: 'Kleines Team: 2–5 Mitarbeiter', value: 'small' },
  { label: 'Wachsendes Team: 6–20 Mitarbeiter', value: 'medium' },
  { label: 'Mittelstand: 21–50 Mitarbeiter', value: 'large' },
  { label: 'Größerer Betrieb: mehr als 50 Mitarbeiter', value: 'large_plus' },
];

const ERFAHRUNG_OPTIONS: WizardOption[] = [
  { label: 'Noch gar nicht — wir fangen bei null an', value: 'Komplettes Neuland' },
  { label: 'Wir nutzen ChatGPT oder ähnliche Tools', value: 'Nutzen ChatGPT oder ähnliche Tools' },
  { label: 'Wir automatisieren bereits einzelne Prozesse mit KI', value: 'Automatisieren bereits einzelne Prozesse' },
  { label: 'KI gehört bei uns fest zum Arbeitsalltag', value: 'AI first' },
];

/** Stored in DB as readable text — chat route matches via keywords */
const ZIEL_OPTIONS: WizardOption[] = [
  {
    label: 'Wir wollen erst prüfen, ob sich KI für uns überhaupt lohnt',
    value: 'Will wissen, ob KI für uns sinnvoll ist',
  },
  {
    label: 'Wir wissen noch nicht, wo wir mit KI und Automatisierung anfangen sollen',
    value: 'Weiß nicht, wo wir anfangen sollen',
  },
  {
    label: 'Wir haben schon erste Ideen — brauchen aber einen klaren Umsetzungsplan',
    value: 'Habe Ideen, brauche Plan',
  },
  {
    label: 'Wir haben einen genauen Plan — und wollen diesen jetzt 1:1 umsetzen',
    value: 'Genauer Plan, nur noch umsetzen',
  },
];

const TECHNIK_OPTIONS: WizardOption[] = [
  { label: 'Wenig bis gar nicht — wir brauchen einfache Erklärungen', value: 'Wenig versiert' },
  { label: 'Basiswissen — wir können Software bedienen und verstehen die Basics', value: 'Basiswissen' },
  { label: 'Fortgeschritten — wir finden uns mit API Keys und Co. zurecht', value: 'Fortgeschritten' },
];

const UMSETZER_OPTIONS: WizardOption[] = [
  { label: 'Ich setze es selbst um', value: 'Ich selbst' },
  { label: 'Jemand im Team (z. B. IT, Ops, Assistenz)', value: 'Jemand intern' },
  { label: 'Ein externer Dienstleister oder Agentur', value: 'Externer Dienstleister' },
  { label: 'Noch unklar — das klären wir im Gespräch', value: 'Noch unklar' },
];

const HINDERNIS_OPTIONS: WizardOption[] = [
  { label: 'Keine Zeit, sich intensiv damit zu beschäftigen', value: 'Keine Zeit uns damit zu beschäftigen' },
  { label: 'Zu wenig technisches Know-how im Team', value: 'Fehlendes Know-How intern' },
  { label: 'Bedenken zu Datenschutz, Sicherheit oder Compliance', value: 'Unsicherheit wegen Datenschutz' },
  { label: 'Unklarheit, welcher Prozess den größten Hebel hat', value: 'Wir wissen nicht, wo wir anfangen sollen' },
  { label: 'Bisher keine passenden Tools oder Anbieter gefunden', value: 'Bisher keine passenden Tools gefunden' },
];

const TEMPO_OPTIONS: WizardOption[] = [
  { label: 'Schnell ans Ziel — eine pragmatische Lösung reicht mir', value: 'Schnell pragmatisch' },
  { label: 'Tempo ist mir nicht so wichtig — Hauptsache, die Lösung passt zu uns', value: 'Offen flexible' },
  { label: 'Gründlichkeit vor Tempo — lieber eine vollständige, saubere Lösung', value: 'Gründlichkeit' },
];

const ROLLE_OPTIONS: WizardOption[] = [
  { label: 'Geschäftsführung / Inhaber (CEO)', value: 'CEO / Geschäftsführung' },
  { label: 'Operatives Management / Teamleitung', value: 'Operatives Management' },
  { label: 'IT / Technik / Systemadministration', value: 'IT / Technik' },
  { label: 'Marketing, Vertrieb oder Projektleitung', value: 'Marketing / Vertrieb / Projektleitung' },
  { label: 'Beratung / Fachberater (intern)', value: 'Beratung / Fachberater' },
  { label: 'Externer Dienstleister oder Agentur', value: 'Externer Dienstleister' },
  { label: 'Sonstige Rolle', value: 'Sonstige Rolle' },
];

const TOTAL_STEPS = 11;

// DEV ONLY: sensible defaults so the dev "Restart" loop can click through (or
// skip) onboarding instantly. Picks the first option value of each question.
const DEV_DEFAULTS: OnboardingData = {
  branche: BRANCHE_OPTIONS[0].value,
  unternehmensgroesse: GROESSE_OPTIONS[0].value,
  ki_erfahrung: ERFAHRUNG_OPTIONS[0].value,
  ziel: ZIEL_OPTIONS[0].value,
  rolle_im_unternehmen: ROLLE_OPTIONS[0].value,
  wer_setzt_um: UMSETZER_OPTIONS[0].value,
  technik_level: TECHNIK_OPTIONS[0].value,
  hindernis: HINDERNIS_OPTIONS[0].value,
  tempo: TEMPO_OPTIONS[0].value,
  vorname: 'Dev',
  firmenname: 'Dev GmbH',
};

export default function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  // DEV: prefill answers when arriving via the dashboard "Restart" button
  // (?dev=1) so the flow can be clicked through — or skipped — instantly.
  const [data, setData] = useState<Partial<OnboardingData>>(() => {
    if (
      process.env.NODE_ENV === 'development' &&
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('dev') === '1'
    ) {
      return { ...DEV_DEFAULTS };
    }
    return {};
  });
  const [existingAccount, setExistingAccount] = useState<{ email: string; password: string } | null>(null);
  const [existingAccountBusy, setExistingAccountBusy] = useState(false);
  const [existingAccountError, setExistingAccountError] = useState<string | null>(null);
  // DEV: when arriving from the dashboard "Restart" button we're already logged
  // in. Detect that so the final step skips re-signup, and prefill answers.
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const isDev = process.env.NODE_ENV === 'development';

  useEffect(() => {
    if (!isDev) return;
    createSupabaseBrowserClient().auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Google OAuth returns to /onboarding as a fresh page load — all wizard state
  // (step, answers) is lost, so without this the user lands back on step 1. If we
  // arrive already authenticated with a saved onboarding payload, finish the
  // onboarding (create project + first chat) instead of restarting the wizard.
  const didResume = useRef(false);
  useEffect(() => {
    if (didResume.current) return;
    const pending = typeof window !== 'undefined' ? localStorage.getItem('pending_onboarding') : null;
    if (!pending) return;
    didResume.current = true;
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      try {
        const payload = JSON.parse(pending) as OnboardingData;
        const projectId = await ensureDefaultProject(session.user.id);
        const sessionId = await createSession(payload, session.user.id, 'diagnose', undefined, undefined, projectId);
        localStorage.removeItem('pending_onboarding');
        localStorage.removeItem('axantilo_intro_message');
        router.push(`/chat?id=${sessionId}`);
      } catch (e) {
        console.error('Onboarding-Resume nach OAuth fehlgeschlagen:', e);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // DEV: build a complete payload (fill any gaps with defaults) and start a
  // fresh project + chat for the already-logged-in user — no re-signup.
  const handleDevSkip = async () => {
    const supabase = createSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/login'); return; }
    try {
      const payload = { ...DEV_DEFAULTS, ...buildPayload() } as OnboardingData;
      const projectId = await ensureDefaultProject(session.user.id);
      const sessionId = await createSession(payload, session.user.id, 'diagnose', undefined, undefined, projectId);
      clearOnboardingStorage();
      router.push(`/chat?id=${sessionId}`);
    } catch (e) {
      console.error('Dev skip failed', e);
    }
  };

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  const updateData = (field: keyof OnboardingData, value: string) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const buildPayload = (): OnboardingData => {
    const intro = typeof window !== 'undefined' ? localStorage.getItem('axantilo_intro_message') : null;
    return (intro ? { ...data, intro_message: intro } : data) as OnboardingData;
  };

  useEffect(() => {
    if (step === TOTAL_STEPS) {
      localStorage.setItem('pending_onboarding', JSON.stringify(buildPayload()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, data]);

  const clearOnboardingStorage = () => {
    localStorage.removeItem('pending_onboarding');
    localStorage.removeItem('axantilo_intro_message');
  };

  const handleAuthSuccess = async () => {
    const payload = buildPayload();
    const supabase = createSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      router.push('/chat?new=true');
      return;
    }

    try {
      const userId = session.user.id;
      const projectId = await ensureDefaultProject(userId);
      const sessionId = await createSession(payload, userId, 'diagnose', undefined, undefined, projectId);
      clearOnboardingStorage();
      router.push(`/chat?id=${sessionId}`);
    } catch (e) {
      console.error('Onboarding-Persistierung in die DB fehlgeschlagen:', e);
      localStorage.setItem('pending_onboarding', JSON.stringify(payload));
      router.push('/chat?new=true');
    }
  };

  const handleStartNewProjectWithOnboarding = async () => {
    if (!existingAccount) return;
    setExistingAccountBusy(true);
    setExistingAccountError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: existingAccount.email,
        password: existingAccount.password,
      });
      if (error) throw error;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Anmeldung fehlgeschlagen.');

      const payload = buildPayload();
      const projectName = payload.firmenname?.trim() || 'Neues Projekt';
      const projectId = await createProject(session.user.id, projectName);
      const sessionId = await createSession(
        payload,
        session.user.id,
        'diagnose',
        undefined,
        undefined,
        projectId,
      );
      clearOnboardingStorage();
      router.push(`/chat?id=${sessionId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.';
      setExistingAccountError(msg);
    } finally {
      setExistingAccountBusy(false);
    }
  };

  const handleCancelOnboardingToLogin = () => {
    clearOnboardingStorage();
    setExistingAccount(null);
    router.push('/login');
  };

  const currentQuestion = () => {
    switch (step) {
      case 1:
        return (
          <QuestionStep
            title="In welcher Branche ist dein Unternehmen tätig?"
            subtitle="Damit Axantilo von Anfang an branchentypische Prozesse versteht."
            options={BRANCHE_OPTIONS}
            value={data.branche}
            onSelect={(v) => updateData('branche', v)}
            onNext={nextStep}
            onBack={prevStep}
            isFirst
            otherOptionValue={BRANCHE_OTHER_VALUE}
            otherInputLabel="Welche Branche trifft auf euch zu?"
            otherInputPlaceholder="z. B. Logistik, Gesundheitswesen, Bildung"
          />
        );
      case 2:
        return (
          <QuestionStep
            title="Wie groß ist dein Team?"
            subtitle="Hilft bei der Ansprache und realistischen Automatisierungs-Vorschlägen."
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
            title="Wo steht ihr heute mit KI und Automatisierung?"
            subtitle="Keine Bewertung — nur der Ist-Zustand."
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
            title="Was beschreibt deine Situation am besten?"
            subtitle="Eine Antwort reicht — wähle, was am ehesten auf euch zutrifft."
            options={ZIEL_OPTIONS}
            value={data.ziel}
            onSelect={(v) => updateData('ziel', v)}
            onNext={nextStep}
            onBack={prevStep}
          />
        );
      case 5:
        return (
          <QuestionStep
            title="Was ist deine Rolle im Unternehmen?"
            subtitle="Für wen die Automatisierung gedacht ist — beeinflusst Ton und technische Tiefe."
            options={ROLLE_OPTIONS}
            value={data.rolle_im_unternehmen}
            onSelect={(v) => updateData('rolle_im_unternehmen', v)}
            onNext={nextStep}
            onBack={prevStep}
          />
        );
      case 6:
        return (
          <QuestionStep
            title="Wie technisch versiert seid ihr?"
            subtitle="Das hilft uns, Erklärungen und Tools auf eurem Level zu halten."
            options={TECHNIK_OPTIONS}
            value={data.technik_level}
            onSelect={(v) => updateData('technik_level', v)}
            onNext={nextStep}
            onBack={prevStep}
          />
        );
      case 7:
        return (
          <QuestionStep
            title="Was hat euch bisher ausgebremst?"
            subtitle="Mehrere Antworten sind möglich — wählt alles, was bei euch zutrifft."
            options={HINDERNIS_OPTIONS}
            value={data.hindernis}
            onSelect={(v) => updateData('hindernis', v)}
            onNext={nextStep}
            onBack={prevStep}
            mode="multi"
          />
        );
      case 8:
        return (
          <QuestionStep
            title="Wie wichtig ist dir Tempo bei der Umsetzung?"
            subtitle="Hilft dem Coach, die Prioritäten richtig zu setzen."
            options={TEMPO_OPTIONS}
            value={data.tempo}
            onSelect={(v) => updateData('tempo', v)}
            onNext={nextStep}
            onBack={prevStep}
          />
        );
      case 9:
        return (
          <TextQuestionStep
            title="Wie dürfen wir dich im Chat ansprechen?"
            subtitle="Dein Vorname — kurz vor dem Account, damit der Coach dich persönlich anspricht."
            placeholder="z. B. Thomas"
            value={data.vorname}
            onChange={(v) => updateData('vorname', v)}
            onNext={nextStep}
            onBack={prevStep}
          />
        );
      case 10:
        return (
          <TextQuestionStep
            title="Wie heißt dein Unternehmen?"
            subtitle="Damit der Coach euren Kontext kennt — direkt vor der Anmeldung."
            placeholder="z. B. Muster GmbH"
            value={data.firmenname}
            onChange={(v) => updateData('firmenname', v)}
            onNext={nextStep}
            onBack={prevStep}
          />
        );
      case 11:
        if (existingAccount) {
          return (
            <OnboardingExistingAccount
              email={existingAccount.email}
              firmenname={data.firmenname}
              loading={existingAccountBusy}
              error={existingAccountError}
              onStartNewProject={handleStartNewProjectWithOnboarding}
              onCancelToLogin={handleCancelOnboardingToLogin}
              onUseDifferentEmail={() => {
                setExistingAccount(null);
                setExistingAccountError(null);
              }}
            />
          );
        }
        if (isLoggedIn) {
          // Already signed in (e.g. dev restart) — skip the auth wall entirely.
          return (
            <div className="flex flex-col gap-6 text-center">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Fast geschafft!</h2>
                <p className="text-gray-500">Du bist bereits angemeldet — wir starten direkt einen neuen Chat.</p>
              </div>
              <button
                type="button"
                onClick={handleAuthSuccess}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                Chat starten <ArrowRight size={20} />
              </button>
            </div>
          );
        }
        return (
          <div className="flex flex-col gap-4">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Fast geschafft!</h2>
              <p className="text-gray-500">Erstelle einen Account, um deine Roadmap und Chats zu speichern.</p>
            </div>
            <AuthForm
              onSuccess={handleAuthSuccess}
              onExistingAccount={({ email, password }) => {
                setExistingAccount({ email, password });
                setExistingAccountError(null);
              }}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="w-full p-6 flex items-center justify-center relative">
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(i => (
            <button
              key={i}
              onClick={() => { if (i < step) setStep(i); }}
              disabled={i >= step}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-indigo-600' : i < step ? 'w-4 bg-indigo-200 hover:bg-indigo-300 cursor-pointer' : 'w-4 bg-gray-200 cursor-default'}`}
            />
          ))}
        </div>
      </div>

      {isDev && isLoggedIn && (
        <button
          type="button"
          onClick={handleDevSkip}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-4 py-2.5 shadow-lg transition-colors"
          title="DEV: Onboarding überspringen, direkt in den Chat"
        >
          ⚡ Skip (Dev) <ArrowRight size={16} />
        </button>
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

function TextQuestionStep({
  title,
  subtitle,
  placeholder,
  value,
  onChange,
  onNext,
  onBack,
  isFirst = false,
}: {
  title: string;
  subtitle?: string;
  placeholder?: string;
  value?: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack?: () => void;
  isFirst?: boolean;
}) {
  const trimmed = (value || '').trim();
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
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-5 py-4 text-lg border-2 border-gray-200 rounded-2xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && trimmed) onNext();
        }}
      />
      <button
        type="button"
        onClick={onNext}
        disabled={!trimmed}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Weiter <ArrowRight size={20} />
      </button>
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
  onBack: () => void;
  isFirst?: boolean;
  mode?: 'single' | 'multi';
  otherOptionValue?: string;
  otherInputLabel?: string;
  otherInputPlaceholder?: string;
}) {
  const isMulti = mode === 'multi';
  const selectedValues = parseMultiValue(value);
  const hasOtherOption = Boolean(otherOptionValue);
  const isOtherActive =
    hasOtherOption &&
    (value === otherOptionValue ||
      isCustomOptionValue(value, options, otherOptionValue!));
  const [otherDraft, setOtherDraft] = useState('');

  // Den „Sonstiges“-Entwurf mit dem value-Prop synchronisieren — im Render abgleichen
  // (statt im Effect), um die setState-in-effect-Kaskade zu vermeiden.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (hasOtherOption) {
      if (isCustomOptionValue(value, options, otherOptionValue!)) {
        setOtherDraft(value!.trim());
      } else if (value !== otherOptionValue) {
        setOtherDraft('');
      }
    }
  }

  const handleSelect = (opt: WizardOption) => {
    if (isMulti) {
      onSelect(toggleMultiValue(value, opt.value));
    } else if (hasOtherOption && opt.value === otherOptionValue) {
      onSelect(opt.value);
    } else {
      onSelect(opt.value);
      setTimeout(() => onNext(), 180);
    }
  };

  const handleOtherContinue = () => {
    const trimmed = otherDraft.trim();
    if (!trimmed) return;
    onSelect(trimmed);
    onNext();
  };

  const otherReady = otherDraft.trim().length > 0;

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
        {subtitle && <p className="text-gray-500 text-base max-w-md mx-auto">{subtitle}</p>}
      </div>
      <div className="flex flex-col gap-3">
        {options.map(opt => {
          const isSelected = isMulti
            ? selectedValues.includes(opt.value)
            : hasOtherOption && opt.value === otherOptionValue
              ? isOtherActive
              : value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelect(opt)}
              className={`p-5 text-left border-2 rounded-2xl transition-all duration-200 hover:border-indigo-400 hover:bg-indigo-50 hover:shadow-sm flex items-start gap-4 ${
                isSelected ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div
                className={`w-6 h-6 mt-0.5 shrink-0 flex items-center justify-center border-2 transition-colors ${
                  isMulti ? 'rounded-md' : 'rounded-full'
                } ${isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'}`}
              >
                {isSelected && (
                  isMulti ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-4 h-4 text-white">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <div className="w-2.5 h-2.5 rounded-full bg-white" />
                  )
                )}
              </div>
              <span className={`text-base font-medium leading-snug ${isSelected ? 'text-indigo-800' : 'text-gray-700'}`}>
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>

      {hasOtherOption && isOtherActive && (
        <div className="flex flex-col gap-3 -mt-2">
          {otherInputLabel && (
            <p className="text-sm font-medium text-gray-600 text-center">{otherInputLabel}</p>
          )}
          <input
            type="text"
            value={otherDraft}
            onChange={(e) => setOtherDraft(e.target.value)}
            placeholder={otherInputPlaceholder}
            className="w-full px-5 py-4 text-lg border-2 border-gray-200 rounded-2xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && otherReady) handleOtherContinue();
            }}
          />
        </div>
      )}

      {(isMulti || (hasOtherOption && isOtherActive)) && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={isOtherActive ? handleOtherContinue : onNext}
            disabled={isOtherActive ? !otherReady : selectedValues.length === 0}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Weiter <ArrowRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
