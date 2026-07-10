import type { Metadata } from 'next';
import BerndOnboardingWizard from './BerndOnboardingWizard';

export const metadata: Metadata = {
  title: 'Bernd einrichten — Axantilo',
  description: 'In wenigen Minuten: Bernd, dein digitaler Mitarbeiter, wird auf deinen Handwerksbetrieb zugeschnitten.',
  alternates: { canonical: '/bernd/onboarding' },
};

export default function BerndOnboardingPage() {
  return <BerndOnboardingWizard />;
}
