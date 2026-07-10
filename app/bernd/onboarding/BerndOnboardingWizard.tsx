'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import AuthForm from '@/components/auth/AuthForm';
import OnboardingExistingAccount from '@/components/onboarding/OnboardingExistingAccount';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { ensureDefaultProject, createProject } from '@/lib/supabase-chat';
import { parseMultiValue, toggleMultiValue } from '@/lib/onboarding-multi';

/**
 * Handwerker-Wizard für Bernd: strukturierte Fragen zu Gewerk, Prozessen, Tools und
 * Zeitfressern, gefolgt von einem kurzen Freitext-Chat-Schritt. Struktur/Auth-Ablauf
 * angelehnt an components/onboarding/OnboardingWizard.tsx (eigenständige Kopie, da Bernd
 * andere Fragen + einen eigenen Provision-Endpoint statt Chat-Session braucht).
 * Die Preislogik (Stundensatz etc.) wird bewusst NICHT im Wizard abgefragt (zu hohe
 * Hemmschwelle) — Bernd fragt sie stattdessen im laufenden Chat (Dashboard/Telegram)
 * einmalig nach, sobald das Betriebsprofil noch keine Preisdaten enthält
 * (siehe app/api/bernd/change/route.ts, app/api/bernd/router/route.ts).
 */

type WizardOption = { label: string; value: string };

/** Wizard-Feldschema — Feldnamen entsprechen 1:1 dem an /api/bernd/provision gesendeten Payload. */
export type BerndWizardData = {
  gewerk?: string;
  auftragsarten?: string; // multi
  angebots_prozess?: string;
  rechnungs_prozess?: string;
  stundensatz?: string;
  materialaufschlag?: string;
  anfahrtspauschale?: string;
  tools?: string; // multi (Tools/CRM/E-Mail)
  kommunikationskanaele?: string; // multi
  zeitfresser?: string; // multi
};

const GEWERK_OPTIONS: WizardOption[] = [
  { label: 'Elektriker', value: 'elektriker' },
  { label: 'Maler', value: 'maler' },
  { label: 'SHK (Sanitär/Heizung/Klima)', value: 'shk' },
  { label: 'Tischler', value: 'tischler' },
  { label: 'Anderes Gewerk', value: 'sonstiges' },
];

const AUFTRAGSARTEN_OPTIONS: WizardOption[] = [
  { label: 'Neubau', value: 'Neubau' },
  { label: 'Sanierung/Renovierung', value: 'Sanierung' },
  { label: 'Notdienst/Störungsbehebung', value: 'Notdienst' },
  { label: 'Laufende Wartung', value: 'Wartung' },
  { label: 'Kleinaufträge/Reparaturen', value: 'Kleinauftraege' },
];

const ANGEBOTS_PROZESS_OPTIONS: WizardOption[] = [
  { label: 'Besichtigung vor Ort, dann Angebot am Schreibtisch', value: 'Besichtigung dann Angebot am Schreibtisch' },
  { label: 'Angebot direkt bei der Besichtigung', value: 'Angebot direkt vor Ort' },
  { label: 'Angebot per Telefon/E-Mail ohne Besichtigung', value: 'Angebot ohne Besichtigung' },
  { label: 'Unterschiedlich, je nach Auftrag', value: 'Unterschiedlich je Auftrag' },
];

const RECHNUNGS_PROZESS_OPTIONS: WizardOption[] = [
  { label: 'Rechnung direkt nach Auftragsabschluss', value: 'Direkt nach Abschluss' },
  { label: 'Rechnung, sobald ich dazu komme', value: 'Verzoegert wenn Zeit ist' },
  { label: 'Anzahlung + Schlussrechnung', value: 'Anzahlung plus Schlussrechnung' },
  { label: 'Mahnungen sind bei mir eher selten', value: 'Kaum Mahnungen' },
];

const TOOLS_OPTIONS: WizardOption[] = [
  { label: 'Gmail', value: 'gmail' },
  { label: 'Outlook', value: 'outlook' },
  { label: 'Google Docs/Sheets', value: 'google_docs' },
  { label: 'WhatsApp', value: 'whatsapp' },
  { label: 'Excel/Word-Vorlagen', value: 'excel_word' },
  { label: 'Eigene Handwerkersoftware/CRM', value: 'crm' },
  { label: 'Noch keine festen Tools', value: 'keine' },
];

const KOMMUNIKATION_OPTIONS: WizardOption[] = [
  { label: 'Telefon', value: 'Telefon' },
  { label: 'WhatsApp', value: 'WhatsApp' },
  { label: 'E-Mail', value: 'E-Mail' },
  { label: 'SMS', value: 'SMS' },
  { label: 'Persönlich vor Ort', value: 'Persoenlich' },
];

const ZEITFRESSER_OPTIONS: WizardOption[] = [
  { label: 'Angebote schreiben', value: 'Angebote schreiben' },
  { label: 'Rechnungen & Mahnwesen', value: 'Rechnungen und Mahnwesen' },
  { label: 'Terminkoordination', value: 'Terminkoordination' },
  { label: 'Telefon während der Arbeit', value: 'Telefon waehrend Arbeit' },
  { label: 'Kunden nachfassen', value: 'Kunden nachfassen' },
  { label: 'Mails beantworten', value: 'Mails beantworten' },
  { label: 'Material-/Lieferschein-Ablage', value: 'Material Ablage' },
];

const TOTAL_STEPS = 9; // 7 Wizard-Fragen + Chat-Schritt + Auth-Schritt (Preislogik jetzt im laufenden Chat abgefragt, nicht im Wizard)

function isCustomOptionValue(value: string | undefined, options: WizardOption[], otherValue: string): boolean {
  if (!value || value === otherValue) return false;
  const standard = options.map((o) => o.value).filter((v) => v !== otherValue);
  return !standard.includes(value);
}

export default function BerndOnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<BerndWizardData>({});
  const [chatNotes, setChatNotes] = useState('');
  const [existingAccount, setExistingAccount] = useState<{ email: string; password: string } | null>(null);
  const [existingAccountBusy, setExistingAccountBusy] = useState(false);
  const [existingAccountError, setExistingAccountError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  useEffect(() => {
    createSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data: { session } }) => setIsLoggedIn(!!session));
  }, []);

  const nextStep = () => setStep((s) => s + 1);
  const prevStep = () => setStep((s) => s - 1);

  const updateData = (field: keyof BerndWizardData, value: string) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  // Persistiert den Wizard-Stand, damit ein Google-OAuth-Redirect (voller Seiten-Reload)
  // nicht den kompletten Fortschritt verliert — analog zum bestehenden Onboarding.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('pending_bernd_onboarding', JSON.stringify({ data, chatNotes }));
  }, [data, chatNotes]);

  const runProvision = async (userId: string, projectId: string) => {
    setProvisionError(null);
    setIsProvisioning(true);
    try {
      const res = await fetch('/api/bernd/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          gewerk: data.gewerk || 'sonstiges',
          wizardData: data,
          chatNotes: chatNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Provisionierung fehlgeschlagen (${res.status})`);
      }
      localStorage.removeItem('pending_bernd_onboarding');
      router.push('/bernd/dashboard');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Bernd konnte nicht eingerichtet werden.';
      setProvisionError(msg);
      // Fail-open: trotzdem weiter zum Dashboard — dort kann nachjustiert/erneut versucht werden.
      router.push('/bernd/dashboard');
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleAuthSuccess = async () => {
    const supabase = createSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/bernd/login');
      return;
    }
    try {
      const userId = session.user.id;
      const projectId = await ensureDefaultProject(userId);
      await runProvision(userId, projectId);
    } catch (e) {
      console.error('Bernd-Onboarding-Persistierung fehlgeschlagen:', e);
      router.push('/bernd/dashboard');
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
      const projectName = data.gewerk ? `Bernd — ${data.gewerk}` : 'Bernd';
      const projectId = await createProject(session.user.id, projectName);
      await runProvision(session.user.id, projectId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.';
      setExistingAccountError(msg);
    } finally {
      setExistingAccountBusy(false);
    }
  };

  const handleCancelOnboardingToLogin = () => {
    localStorage.removeItem('pending_bernd_onboarding');
    setExistingAccount(null);
    router.push('/bernd/login');
  };

  const currentQuestion = () => {
    switch (step) {
      case 1:
        return (
          <QuestionStep
            title="Welches Gewerk führst du?"
            subtitle="Damit Bernd von Anfang an deine typischen Abläufe versteht."
            options={GEWERK_OPTIONS}
            value={data.gewerk}
            onSelect={(v) => updateData('gewerk', v)}
            onNext={nextStep}
            onBack={prevStep}
            isFirst
          />
        );
      case 2:
        return (
          <QuestionStep
            title="Welche Auftragsarten hast du am häufigsten?"
            subtitle="Mehrere Antworten möglich."
            options={AUFTRAGSARTEN_OPTIONS}
            value={data.auftragsarten}
            onSelect={(v) => updateData('auftragsarten', v)}
            onNext={nextStep}
            onBack={prevStep}
            mode="multi"
          />
        );
      case 3:
        return (
          <QuestionStep
            title="Wie läuft dein Angebots-Prozess ab?"
            subtitle="Vom ersten Kontakt bis zum fertigen Angebot."
            options={ANGEBOTS_PROZESS_OPTIONS}
            value={data.angebots_prozess}
            onSelect={(v) => updateData('angebots_prozess', v)}
            onNext={nextStep}
            onBack={prevStep}
          />
        );
      case 4:
        return (
          <QuestionStep
            title="Wie läuft dein Rechnungs- und Mahnwesen ab?"
            subtitle="Ehrliche Antwort — Bernd urteilt nicht, er übernimmt."
            options={RECHNUNGS_PROZESS_OPTIONS}
            value={data.rechnungs_prozess}
            onSelect={(v) => updateData('rechnungs_prozess', v)}
            onNext={nextStep}
            onBack={prevStep}
          />
        );
      case 5:
        return (
          <QuestionStep
            title="Welche Tools nutzt du bereits?"
            subtitle="E-Mail-Anbieter, CRM, Vorlagen — mehrere Antworten möglich."
            options={TOOLS_OPTIONS}
            value={data.tools}
            onSelect={(v) => updateData('tools', v)}
            onNext={nextStep}
            onBack={prevStep}
            mode="multi"
          />
        );
      case 6:
        return (
          <QuestionStep
            title="Wie kommunizierst du mit Kunden?"
            subtitle="Mehrere Antworten möglich."
            options={KOMMUNIKATION_OPTIONS}
            value={data.kommunikationskanaele}
            onSelect={(v) => updateData('kommunikationskanaele', v)}
            onNext={nextStep}
            onBack={prevStep}
            mode="multi"
          />
        );
      case 7:
        return (
          <QuestionStep
            title="Was frisst bei dir am meisten Zeit?"
            subtitle="Wähle alles, was zutrifft — hier setzt Bernd zuerst an."
            options={ZEITFRESSER_OPTIONS}
            value={data.zeitfresser}
            onSelect={(v) => updateData('zeitfresser', v)}
            onNext={nextStep}
            onBack={prevStep}
            mode="multi"
          />
        );
      case 8:
        return (
          <ChatNotesStep
            value={chatNotes}
            onChange={setChatNotes}
            onNext={nextStep}
            onBack={prevStep}
          />
        );
      case 9:
        if (isProvisioning) {
          return (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              <h2 className="text-2xl font-bold text-gray-900">Bernd wird eingerichtet …</h2>
              <p className="text-gray-500">Das dauert nur einen Moment.</p>
            </div>
          );
        }
        if (existingAccount) {
          return (
            <OnboardingExistingAccount
              email={existingAccount.email}
              firmenname={data.gewerk ? `Bernd — ${data.gewerk}` : undefined}
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
          return (
            <div className="flex flex-col gap-6 text-center">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Fast geschafft!</h2>
                <p className="text-gray-500">Du bist bereits angemeldet — Bernd wird direkt eingerichtet.</p>
              </div>
              {provisionError && (
                <div className="p-3 bg-amber-50 text-amber-700 text-sm rounded-lg">{provisionError}</div>
              )}
              <button
                type="button"
                onClick={handleAuthSuccess}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                Bernd einrichten <ArrowRight size={20} />
              </button>
            </div>
          );
        }
        return (
          <div className="flex flex-col gap-4">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Fast geschafft!</h2>
              <p className="text-gray-500">Erstelle einen Account, damit Bernd deinen Betrieb dauerhaft kennt.</p>
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
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((i) => (
            <button
              key={i}
              onClick={() => {
                if (i < step) setStep(i);
              }}
              disabled={i >= step}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step
                  ? 'w-8 bg-indigo-600'
                  : i < step
                    ? 'w-4 bg-indigo-200 hover:bg-indigo-300 cursor-pointer'
                    : 'w-4 bg-gray-200 cursor-default'
              }`}
            />
          ))}
        </div>
      </div>

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

function ChatNotesStep({
  value,
  onChange,
  onNext,
  onBack,
}: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
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
        <h2 className="text-3xl font-bold text-gray-900 leading-tight mb-2">
          Gibt&apos;s noch etwas, das Bernd über deinen Betrieb wissen muss?
        </h2>
        <p className="text-gray-500 text-base max-w-md mx-auto">
          Sonderfälle, feste Textbausteine, No-Gos oder alles, was die Fragen vorher nicht abgedeckt haben. Optional.
        </p>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="z. B. Bei Notdienst-Anfragen immer sofort antworten, auch nachts …"
        rows={5}
        className="w-full px-5 py-4 text-base border-2 border-gray-200 rounded-2xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all resize-none"
        autoFocus
      />
      <button
        type="button"
        onClick={onNext}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all"
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
}) {
  const isMulti = mode === 'multi';
  const selectedValues = parseMultiValue(value);

  const handleSelect = (opt: WizardOption) => {
    if (isMulti) {
      onSelect(toggleMultiValue(value, opt.value));
    } else {
      onSelect(opt.value);
      setTimeout(() => onNext(), 180);
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
        {subtitle && <p className="text-gray-500 text-base max-w-md mx-auto">{subtitle}</p>}
      </div>
      <div className="flex flex-col gap-3">
        {options.map((opt) => {
          const isSelected = isMulti
            ? selectedValues.includes(opt.value)
            : value === opt.value || isCustomOptionValue(value, options, '');
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
                {isSelected &&
                  (isMulti ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-4 h-4 text-white">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <div className="w-2.5 h-2.5 rounded-full bg-white" />
                  ))}
              </div>
              <span className={`text-base font-medium leading-snug ${isSelected ? 'text-indigo-800' : 'text-gray-700'}`}>
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>

      {isMulti && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
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
