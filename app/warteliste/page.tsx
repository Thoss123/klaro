import type { Metadata } from 'next';
import WaitlistWizard from '@/components/waitlist/WaitlistWizard';

export const metadata: Metadata = {
  title: 'Warteliste — Axantilo Testphase für Immobilienmakler',
  description:
    'Trag dich auf die Axantilo-Warteliste ein: Sag uns, welche Prozesse du automatisieren willst — wir melden uns mit deinem Testzugang.',
};

export default function WartelistePage() {
  return <WaitlistWizard />;
}
