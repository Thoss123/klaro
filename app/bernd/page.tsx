import type { Metadata } from 'next';
import BerndLanding from './BerndLanding';

export const metadata: Metadata = {
  title: 'Bernd — dein digitaler Mitarbeiter für den Handwerksbetrieb',
  description:
    'Bernd schreibt Angebote, stellt Rechnungen, fasst nach und sortiert deine Mails — gesteuert per Telegram, auch per Sprachnachricht und Foto. Für Elektriker, Maler, SHK und Tischler.',
  alternates: { canonical: '/bernd' },
  openGraph: {
    title: 'Bernd — dein digitaler Mitarbeiter für den Handwerksbetrieb',
    description:
      'Angebote, Rechnungen, Nachfassen, Postfach — Bernd übernimmt die Bürozeit, gesteuert per Telegram. Sprachnachricht rein, Erledigung raus.',
    url: 'https://axantilo.com/bernd',
  },
};

export default function BerndPage() {
  return <BerndLanding />;
}
