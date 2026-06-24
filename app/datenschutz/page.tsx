import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function DatenschutzPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-2 text-sm font-medium mb-8"
        >
          <ArrowLeft size={16} /> Zurück zur Startseite
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Datenschutzerklärung</h1>
        <p className="text-sm text-gray-500 mb-10">Stand: Juni 2026</p>

        {/* 1 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Verantwortlicher</h2>
          <p className="text-gray-700 leading-relaxed">
            Verantwortlicher im Sinne der DSGVO ist:<br /><br />
            Thomas Hruby<br />
            Albersdorf 244, 8200 Gleisdorf, Österreich<br />
            E-Mail: <a href="mailto:hello@axantilo.com" className="underline hover:text-gray-900">hello@axantilo.com</a><br />
            Telefon: +43 677 62853686
          </p>
        </section>

        {/* 2 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Welche Daten wir verarbeiten</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Bei der Nutzung von Axantilo verarbeiten wir folgende personenbezogene Daten:
          </p>
          <ul className="list-disc pl-5 text-gray-700 leading-relaxed space-y-1">
            <li><strong>Kontodaten:</strong> E-Mail-Adresse, ggf. Name (bei Registrierung oder Google-Login)</li>
            <li><strong>Projektdaten:</strong> von Ihnen eingegebene Unternehmensinformationen, Schmerzpunkte und Workflow-Beschreibungen</li>
            <li><strong>Chat-Nachrichten:</strong> Konversationen mit dem KI-Coach</li>
            <li><strong>Technische Daten:</strong> IP-Adresse, Browsertyp, Zeitstempel (verarbeitet durch den Hosting-Anbieter Vercel)</li>
            <li><strong>Nutzungsdaten:</strong> Seitenaufrufe, Aktionen innerhalb der Anwendung (nur soweit technisch notwendig)</li>
          </ul>
        </section>

        {/* 3 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Zweck und Rechtsgrundlagen</h2>
          <div className="text-gray-700 leading-relaxed space-y-3">
            <p>
              <strong>Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO):</strong> Bereitstellung der Axantilo-Plattform,
              Verwaltung Ihres Nutzerkontos, Zustellung von Automatisierungs-Workflows über n8n.
            </p>
            <p>
              <strong>Berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO):</strong> Sicherstellung des Betriebs,
              Fehlerbehebung und Verbesserung der Plattform.
            </p>
            <p>
              <strong>Einwilligung (Art. 6 Abs. 1 lit. a DSGVO):</strong> soweit Sie bei der Registrierung
              oder Nutzung ausdrücklich zustimmen.
            </p>
          </div>
        </section>

        {/* 4 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Drittanbieter</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            Zur Bereitstellung unserer Dienste setzen wir folgende Drittanbieter ein, an die personenbezogene
            Daten übermittelt werden können:
          </p>

          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Supabase (Datenbank & Authentifizierung)</h3>
              <p className="text-gray-700 leading-relaxed text-sm">
                Supabase Inc., 970 Toa Payoh North, Singapur. Speicherung von Nutzerdaten, Chat-Verläufen und
                Projektdaten. Datenverarbeitung erfolgt in EU-Rechenzentren (Frankfurt). Weitere Informationen:{' '}
                <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="underline">
                  supabase.com/privacy
                </a>.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Mistral AI (KI-Verarbeitung)</h3>
              <p className="text-gray-700 leading-relaxed text-sm">
                Mistral AI SAS, 15 rue des Halles, 75001 Paris, Frankreich (EU). Ihre Chat-Nachrichten und
                Projektdaten werden zur KI-gestützten Analyse an Mistral AI übermittelt. Mistral AI ist ein
                europäisches Unternehmen und verarbeitet Daten ausschließlich in der EU. Weitere Informationen:{' '}
                <a href="https://mistral.ai/terms" target="_blank" rel="noopener noreferrer" className="underline">
                  mistral.ai/terms
                </a>.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Google (OAuth-Login)</h3>
              <p className="text-gray-700 leading-relaxed text-sm">
                Google LLC, 1600 Amphitheatre Parkway, Mountain View, CA 94043, USA. Wenn Sie sich per
                Google-Konto anmelden, übermittelt Google Ihre E-Mail-Adresse und Ihren Namen an uns.
                Google ist unter dem EU-US Data Privacy Framework (DPF) zertifiziert. KI-Verarbeitung
                durch Google findet nicht statt. Weitere Informationen:{' '}
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline">
                  policies.google.com/privacy
                </a>.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Vercel (Hosting)</h3>
              <p className="text-gray-700 leading-relaxed text-sm">
                Vercel Inc., 340 Pine Street, Suite 701, San Francisco, CA 94104, USA. Axantilo wird auf
                der Vercel-Infrastruktur betrieben. Vercel verarbeitet technische Zugriffsdaten
                (IP-Adresse, Zeitstempel). Datenübermittlung in die USA ist durch Standardvertragsklauseln
                (SCC) abgesichert. Weitere Informationen:{' '}
                <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline">
                  vercel.com/legal/privacy-policy
                </a>.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Hostinger (Server-Infrastruktur)</h3>
              <p className="text-gray-700 leading-relaxed text-sm">
                Hostinger International Ltd., 61 Lordou Vironos Street, 3035 Limassol, Zypern (EU).
                Die Workflow-Automatisierungen von Axantilo laufen auf einem dedizierten Virtual
                Private Server (VPS) bei Hostinger. Hostinger verarbeitet dabei Daten als technischer
                Infrastrukturanbieter. Weitere Informationen:{' '}
                <a href="https://www.hostinger.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline">
                  hostinger.com/privacy-policy
                </a>.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Resend (Transaktions-E-Mails)</h3>
              <p className="text-gray-700 leading-relaxed text-sm">
                Resend Inc., USA. Zum Versand von System-E-Mails (z. B. Bestätigungen, Benachrichtigungen)
                wird Ihre E-Mail-Adresse an Resend übermittelt. Datenübermittlung in die USA ist durch
                Standardvertragsklauseln (SCC) abgesichert. Weitere Informationen:{' '}
                <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline">
                  resend.com/legal/privacy-policy
                </a>.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Twilio (SMS-Benachrichtigungen)</h3>
              <p className="text-gray-700 leading-relaxed text-sm">
                Twilio Inc., 375 Beale Street, Suite 300, San Francisco, CA 94105, USA. Sofern
                SMS-Benachrichtigungen aktiviert sind, wird Ihre Telefonnummer an Twilio übermittelt.
                Datenübermittlung in die USA ist durch Standardvertragsklauseln (SCC) abgesichert.
                Weitere Informationen:{' '}
                <a href="https://www.twilio.com/en-us/legal/privacy" target="_blank" rel="noopener noreferrer" className="underline">
                  twilio.com/legal/privacy
                </a>.
              </p>
            </div>
          </div>
        </section>

        {/* 5 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Speicherdauer</h2>
          <p className="text-gray-700 leading-relaxed">
            Ihre Daten werden so lange gespeichert, wie Ihr Nutzerkonto aktiv ist oder wie es zur
            Vertragserfüllung notwendig ist. Nach Kündigung Ihres Kontos werden personenbezogene Daten
            innerhalb von 30 Tagen gelöscht, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen
            (z. B. steuerrechtliche Aufbewahrungsfristen von 7 Jahren für Rechnungsdaten).
          </p>
        </section>

        {/* 6 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Ihre Rechte</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Sie haben gegenüber uns folgende Rechte hinsichtlich Ihrer personenbezogenen Daten:
          </p>
          <ul className="list-disc pl-5 text-gray-700 leading-relaxed space-y-1">
            <li><strong>Auskunft</strong> (Art. 15 DSGVO): Welche Daten wir über Sie verarbeiten</li>
            <li><strong>Berichtigung</strong> (Art. 16 DSGVO): Korrektur unrichtiger Daten</li>
            <li><strong>Löschung</strong> (Art. 17 DSGVO): Recht auf &bdquo;Vergessenwerden&ldquo;</li>
            <li><strong>Einschränkung</strong> (Art. 18 DSGVO): Einschränkung der Verarbeitung</li>
            <li><strong>Datenportabilität</strong> (Art. 20 DSGVO): Herausgabe Ihrer Daten in einem gängigen Format</li>
            <li><strong>Widerspruch</strong> (Art. 21 DSGVO): Widerspruch gegen auf berechtigtem Interesse basierende Verarbeitungen</li>
          </ul>
          <p className="text-gray-700 leading-relaxed mt-3">
            Zur Ausübung dieser Rechte wenden Sie sich an:{' '}
            <a href="mailto:hello@axantilo.com" className="underline hover:text-gray-900">hello@axantilo.com</a>.
          </p>
        </section>

        {/* 7 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Beschwerderecht</h2>
          <p className="text-gray-700 leading-relaxed">
            Sie haben das Recht, sich bei der österreichischen Datenschutzbehörde zu beschweren:<br /><br />
            Österreichische Datenschutzbehörde<br />
            Barichgasse 40–42, 1030 Wien<br />
            <a href="https://www.dsb.gv.at" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-900">
              www.dsb.gv.at
            </a>
          </p>
        </section>

        {/* 8 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">8. Cookies</h2>
          <p className="text-gray-700 leading-relaxed">
            Axantilo verwendet ausschließlich technisch notwendige Cookies für die Authentifizierung
            (Session-Verwaltung über Supabase Auth). Diese Cookies sind für die Funktion der Anwendung
            zwingend erforderlich und benötigen keine Einwilligung gemäß Art. 5 Abs. 3 ePrivacy-Richtlinie.
            Tracking-, Analyse- oder Marketing-Cookies werden nicht eingesetzt.
          </p>
        </section>
      </div>
    </div>
  );
}
