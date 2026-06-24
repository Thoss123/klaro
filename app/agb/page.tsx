import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function AgbPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-2 text-sm font-medium mb-8"
        >
          <ArrowLeft size={16} /> Zurück zur Startseite
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Allgemeine Geschäftsbedingungen</h1>
        <p className="text-sm text-gray-500 mb-10">Stand: Juni 2026</p>

        {/* 1 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">§ 1 Geltungsbereich</h2>
          <p className="text-gray-700 leading-relaxed">
            Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für alle Verträge zwischen Thomas Hruby,
            Albersdorf 244, 8200 Gleisdorf, Österreich (nachfolgend &bdquo;Anbieter&ldquo;) und Unternehmen, die die
            Plattform Axantilo (axantilo.com) nutzen (nachfolgend &bdquo;Nutzer&ldquo;). Axantilo richtet sich
            ausschließlich an Unternehmer im Sinne des § 1 KSchG (B2B). Verbraucher im Sinne des
            Konsumentenschutzgesetzes sind ausgeschlossen.
          </p>
        </section>

        {/* 2 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">§ 2 Leistungsbeschreibung</h2>
          <p className="text-gray-700 leading-relaxed">
            Axantilo ist eine cloudbasierte SaaS-Plattform, die Unternehmen durch einen KI-gestützten
            Coach durch vier Phasen der Workflow-Automatisierung führt: Diagnose, Analyse, Planung und
            Umsetzung. Im Rahmen der Umsetzungsphase werden Automatisierungs-Workflows über die
            Drittanbieterplattform n8n bereitgestellt. Der Anbieter schuldet die Bereitstellung der
            Plattform als Software as a Service, jedoch keinen bestimmten wirtschaftlichen Erfolg.
          </p>
        </section>

        {/* 3 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">§ 3 Vertragsschluss</h2>
          <p className="text-gray-700 leading-relaxed">
            Der Vertrag kommt durch die Registrierung des Nutzers auf axantilo.com (Angebot) und die
            Freischaltung des Kontos durch den Anbieter (Annahme) zustande. Mit der Registrierung
            akzeptiert der Nutzer diese AGB sowie die Datenschutzerklärung.
          </p>
        </section>

        {/* 4 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">§ 4 Nutzungsrechte</h2>
          <p className="text-gray-700 leading-relaxed">
            Der Anbieter räumt dem Nutzer für die Dauer des Vertrags ein einfaches, nicht übertragbares
            und nicht unterlizenzierbares Recht ein, Axantilo über einen Browser im Rahmen dieser AGB
            zu nutzen. Eine Weitergabe von Zugangsdaten an Dritte ist untersagt.
          </p>
        </section>

        {/* 5 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">§ 5 Pflichten des Nutzers</h2>
          <p className="text-gray-700 leading-relaxed mb-3">Der Nutzer verpflichtet sich:</p>
          <ul className="list-disc pl-5 text-gray-700 leading-relaxed space-y-1">
            <li>keine rechtswidrigen Inhalte einzugeben oder zu verarbeiten</li>
            <li>keine automatisierten Zugriffe (Scraping, Bots) außerhalb der vorgesehenen API-Nutzung durchzuführen</li>
            <li>keine Reverse-Engineering-Maßnahmen an der Plattform vorzunehmen</li>
            <li>Zugangsdaten sicher zu verwahren und Missbrauch unverzüglich zu melden</li>
            <li>die Plattform nicht in einer Weise zu nutzen, die Dritte schädigt oder die Verfügbarkeit der Plattform beeinträchtigt</li>
          </ul>
        </section>

        {/* 6 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">§ 6 Preise und Zahlung</h2>
          <p className="text-gray-700 leading-relaxed">
            Die aktuellen Preise und Zahlungsmodalitäten sind auf axantilo.com/preise einsehbar.
            Alle Preise verstehen sich als Nettopreise zuzüglich der gesetzlichen Umsatzsteuer,
            sofern anwendbar. Rechnungen sind innerhalb von 14 Tagen nach Rechnungsdatum zu begleichen.
          </p>
        </section>

        {/* 7 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">§ 7 Laufzeit und Kündigung</h2>
          <p className="text-gray-700 leading-relaxed">
            Der Vertrag läuft auf unbestimmte Zeit und kann von beiden Seiten mit einer Frist von
            30 Tagen zum Monatsende in Textform (E-Mail) gekündigt werden. Das Recht zur
            außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt. Ein wichtiger Grund
            liegt insbesondere vor, wenn der Nutzer gegen § 5 dieser AGB verstößt.
          </p>
        </section>

        {/* 8 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">§ 8 Verfügbarkeit</h2>
          <p className="text-gray-700 leading-relaxed">
            Der Anbieter strebt eine hohe Verfügbarkeit der Plattform an, garantiert jedoch keine
            ununterbrochene Verfügbarkeit. Geplante Wartungsarbeiten werden nach Möglichkeit vorab
            angekündigt. Ausfälle durch Drittanbieter (insbesondere Supabase, Vercel, Mistral AI, n8n)
            liegen außerhalb des Einflussbereichs des Anbieters.
          </p>
        </section>

        {/* 9 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">§ 9 Haftung</h2>
          <p className="text-gray-700 leading-relaxed">
            Der Anbieter haftet unbeschränkt für Schäden aus der Verletzung des Lebens, des Körpers
            oder der Gesundheit sowie bei Vorsatz und grober Fahrlässigkeit. Bei leichter
            Fahrlässigkeit haftet der Anbieter nur bei Verletzung wesentlicher Vertragspflichten
            (Kardinalspflichten) und nur in Höhe des vorhersehbaren, vertragstypischen Schadens.
            Eine Haftung für mittelbare Schäden, entgangenen Gewinn oder Datenverluste ist bei
            leichter Fahrlässigkeit ausgeschlossen. Die Haftung für die durch KI generierten
            Empfehlungen und Workflows ist auf die Sorgfalt eines ordentlichen Softwareanbieters
            beschränkt — der Nutzer trägt die unternehmerische Verantwortung für die Nutzung
            der erstellten Automatisierungen.
          </p>
        </section>

        {/* 10 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">§ 10 Datenschutz</h2>
          <p className="text-gray-700 leading-relaxed">
            Die Verarbeitung personenbezogener Daten erfolgt gemäß unserer{' '}
            <Link href="/datenschutz" className="underline hover:text-gray-900">
              Datenschutzerklärung
            </Link>
            , die Bestandteil dieser AGB ist.
          </p>
        </section>

        {/* 11 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">§ 11 Änderungen der AGB</h2>
          <p className="text-gray-700 leading-relaxed">
            Der Anbieter ist berechtigt, diese AGB mit einer Ankündigungsfrist von 4 Wochen per
            E-Mail zu ändern. Widerspricht der Nutzer den geänderten AGB nicht innerhalb dieser
            Frist schriftlich, gelten die Änderungen als akzeptiert. Auf das Widerspruchsrecht
            und die Folgen des Schweigens wird in der Ankündigung ausdrücklich hingewiesen.
          </p>
        </section>

        {/* 12 */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">§ 12 Anwendbares Recht und Gerichtsstand</h2>
          <p className="text-gray-700 leading-relaxed">
            Es gilt österreichisches Recht unter Ausschluss des UN-Kaufrechts (CISG). Ausschließlicher
            Gerichtsstand für alle Streitigkeiten aus diesem Vertragsverhältnis ist — soweit gesetzlich
            zulässig — das sachlich zuständige Gericht in Gleisdorf, Österreich.
          </p>
        </section>
      </div>
    </div>
  );
}
