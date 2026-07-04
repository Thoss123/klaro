import type { Metadata } from 'next';
import MaklerLanding from './MaklerLanding';

export const metadata: Metadata = {
  title: 'Axantilo für Immobilienmakler — Dein Maklergeschäft läuft von selbst',
  description:
    'Von der Portalanfrage bis zur Provisionsrechnung: Axantilo orchestriert justimmo, Portale, Postfach und Kalender — Exposés, Follow-ups, Ads und Abrechnung laufen automatisch.',
  alternates: { canonical: '/immobilienmakler' },
  openGraph: {
    title: 'Axantilo für Immobilienmakler — Dein Maklergeschäft läuft von selbst',
    description:
      'Axantilo orchestriert deine bestehenden Makler-Tools und erledigt die Arbeit dazwischen — Exposés, Follow-ups, Ads, Termine, Abrechnung.',
    url: 'https://axantilo.com/immobilienmakler',
  },
};

export default function ImmobilienmaklerPage() {
  return <MaklerLanding />;
}
