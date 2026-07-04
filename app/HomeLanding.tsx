'use client';

import Link from 'next/link';
import {
  SiAirtable,
  SiGmail,
  SiGooglecalendar,
  SiGoogledrive,
  SiGooglesheets,
  SiHubspot,
  SiNotion,
  SiShopify,
  SiSlack,
  SiStripe,
  SiWhatsapp,
} from 'react-icons/si';
import { landingFontVars } from '@/components/landing-v2/fonts';
import { landingCss } from '@/components/landing-v2/styles';
import { useReveal } from '@/components/landing-v2/useReveal';
import OrchestrationGraph from '@/components/landing-v2/OrchestrationGraph';
import VsTable, { type VsRow } from '@/components/landing-v2/VsTable';
import IntegrationChips, { type IntegrationItem } from '@/components/landing-v2/IntegrationChips';
import ChatDemo, { type ChatLine } from '@/components/landing-v2/ChatDemo';
import { Logo } from '@/components/Logo';

const CheckIc = () => (
  <svg className="ic" viewBox="0 0 20 20" fill="none">
    <path d="M4 10.5l4 4 8-9" stroke="#2F6BFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CrossIc = () => (
  <svg className="ic" viewBox="0 0 20 20" fill="none">
    <path d="M5 5l10 10M15 5L5 15" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const VS_ROWS: VsRow[] = [
  {
    crit: 'Kosten',
    old: (
      <>
        <span className="vs-price">€5.000–15.000</span> Setup, plus laufender Retainer
      </>
    ),
    neu: (
      <>
        <span className="vs-price">Ein Bruchteil davon</span> — keine Setup-Gebühr, monatlich kündbar
      </>
    ),
  },
  {
    crit: 'Zeit bis es läuft',
    old: 'Wochen bis Monate: Workshops, Konzepte, Abstimmungsschleifen',
    neu: 'Ein Gespräch. Der Workflow läuft, bevor der Kaffee kalt ist.',
  },
  {
    crit: 'Änderungen',
    old: 'Ticket schreiben, Angebot abwarten, Change bezahlen',
    neu: 'Im Chat sagen. Sofort angepasst, ohne Aufpreis.',
  },
  {
    crit: 'Vorkenntnisse',
    old: 'Du musst briefen können und verstehen, was technisch möglich ist',
    neu: 'Null. Axantilo kennt die typischen Abläufe und fragt nur nach deinen Details.',
  },
  {
    crit: 'Abhängigkeit',
    old: 'Das Wissen über deine Prozesse liegt bei der Agentur',
    neu: 'Du siehst jeden Workflow und jede Aktion im Protokoll. Volle Transparenz.',
  },
  {
    crit: 'Datenschutz',
    old: 'Abhängig davon, welche Tools die Agentur zusammensteckt',
    neu: 'DSGVO by design: EU-Hosting, EU-AI-Modelle, Auftragsverarbeitung inklusive',
  },
];

const INTEGRATIONS: IntegrationItem[] = [
  { label: 'Gmail', icon: <SiGmail size={18} color="#EA4335" /> },
  { label: 'Outlook', domain: 'outlook.com' },
  { label: 'Google Sheets', icon: <SiGooglesheets size={18} color="#34A853" /> },
  { label: 'Google Drive', icon: <SiGoogledrive size={18} color="#1FA463" /> },
  { label: 'Google Kalender', icon: <SiGooglecalendar size={18} color="#4285F4" /> },
  { label: 'Excel', domain: 'microsoft.com' },
  { label: 'Slack', icon: <SiSlack size={18} color="#4A154B" /> },
  { label: 'Notion', icon: <SiNotion size={18} color="#111827" /> },
  { label: 'HubSpot', icon: <SiHubspot size={18} color="#FF7A59" /> },
  { label: 'Airtable', icon: <SiAirtable size={18} color="#18BFFF" /> },
  { label: 'WhatsApp', icon: <SiWhatsapp size={18} color="#25D366" /> },
  { label: 'Shopify', icon: <SiShopify size={18} color="#7AB55C" /> },
  { label: 'Stripe', icon: <SiStripe size={18} color="#635BFF" /> },
];

const CHAT_LINES: ChatLine[] = [
  {
    role: 'ai',
    text: 'Hallo! Erzähl mir von deinem Betrieb — was frisst bei dir am meisten Zeit?',
  },
  {
    role: 'user',
    text: 'Angebote dauern ewig, und im Postfach geht ständig Wichtiges unter.',
  },
  {
    role: 'ai',
    text: 'Übernehme ich beides: Angebote entstehen als fertiger Entwurf aus deinen Daten, dein Postfach wird vorsortiert. Womit arbeitet ihr — Gmail oder Outlook?',
  },
  { role: 'user', text: 'Outlook, und unsere Preisliste liegt in Excel.' },
  {
    role: 'ai',
    text: 'Perfekt. Ich verbinde Outlook und deine Excel-Preisliste — jedes Angebot bekommst du zur Freigabe, bevor es rausgeht.',
  },
  { role: 'sys', text: '✓ 2 Workflows deployed — laufen' },
];

export default function HomeLanding() {
  useReveal();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: landingCss }} />

      <div className={`landing-v2 ${landingFontVars}`}>
        <nav>
          <div className="wrap nav-inner">
            <a className="logo" href="#top">
              <Logo height={26} inverted />
            </a>
            <div className="nav-links">
              <a href="#ergebnisse">Ergebnisse</a>
              <a href="#agency">Vs. AI-Agentur</a>
              <a href="#how">So funktioniert&apos;s</a>
              <Link href="/immobilienmakler">Für Immobilienmakler</Link>
              <Link href="/login" className="nav-login">
                Login
              </Link>
              <Link href="/onboarding" className="btn btn-live">
                Kostenlos starten
              </Link>
            </div>
          </div>
        </nav>

        {/* ============ HERO ============ */}
        <header className="hero" id="top">
          <div className="wrap">
            <h1 className="rv rv-d1">
              Du erzählst, was liegen bleibt.
              <br />
              <em>Ab morgen läuft es von selbst.</em>
            </h1>
            <p className="hero-sub rv rv-d2">
              Axantilo findet im Gespräch heraus, wo in deinem Betrieb die meiste Zeit verschwindet — und baut daraus
              Automatisierungen in deinen bestehenden Tools: Angebote raus in Minuten, Posteingang vorsortiert,
              Rechnungen gestellt.
            </p>
            <div className="hero-ctas rv rv-d3">
              <Link href="/onboarding" className="btn btn-live">
                Kostenlos starten
              </Link>
              <a href="#ergebnisse" className="btn btn-ghost">
                Ergebnisse ansehen
              </a>
            </div>
            <div className="uspbar rv rv-d4">
              <span className="usp">
                <b>✓</b> Null Vorkenntnisse nötig
              </span>
              <span className="usp">
                <b>✓</b> DSGVO · EU-Hosting
              </span>
              <span className="usp">
                <b>✓</b> Ergebnis statt Ideen-PDF
              </span>
            </div>

            <OrchestrationGraph
              idPrefix="hm"
              inputs={[
                { label: 'Postfach', sub: 'Gmail · Outlook' },
                { label: 'Tabellen', sub: 'Excel · Google Sheets' },
                { label: 'CRM', sub: 'HubSpot · Notion · Airtable' },
                { label: 'Kalender', sub: 'Termine & Fristen' },
              ]}
              outputs={[
                { label: 'Angebot verschickt', sub: 'Entwurf fertig, du gibst frei' },
                { label: 'Posteingang sortiert', sub: 'Wichtiges oben, Rest erledigt' },
                { label: 'Rechnung gestellt', sub: 'inkl. Erinnerung und Ablage' },
                { label: 'Termin koordiniert', sub: 'vorgeschlagen & bestätigt' },
              ]}
              coreSub={['versteht · plant ·', 'baut · erledigt']}
              ariaDesktop="Diagramm: Postfach, Tabellen, CRM und Kalender fließen durch Axantilo — heraus kommen verschickte Angebote, ein sortierter Posteingang, gestellte Rechnungen und koordinierte Termine."
              ariaMobile="Mobil: Deine Tools fließen durch Axantilo — heraus kommen erledigte Angebote, sortierte Mails, Rechnungen und Termine."
            />
          </div>
        </header>

        {/* ============ PROBLEM ============ */}
        <section className="problem">
          <div className="wrap">
            <p className="eyebrow mono rv">Der Alltag heute</p>
            <h2 className="rv rv-d1">
              Zwischendurch die Mails, abends die Angebote, am Monatsende der Papierkram.
            </h2>
            <div className="pgrid">
              <div className="pcard rv">
                <span className="ptime">19:30 Uhr</span>
                <h3>Das Angebot schreibst du nach Feierabend</h3>
                <p>
                  Die Anfrage kam mittags. Bis du Kundendaten, Preise und Texte zusammen hast, ist der Tag vorbei — und
                  der Interessent vergleicht längst woanders.
                </p>
              </div>
              <div className="pcard rv rv-d1">
                <span className="ptime">40+ Mails / Tag</span>
                <h3>Der Posteingang bestimmt deinen Tag</h3>
                <p>
                  Zwischen Newslettern und Rückfragen steckt die eine wichtige Anfrage. Du sortierst von Hand — jeden Tag
                  aufs Neue, statt zu arbeiten.
                </p>
              </div>
              <div className="pcard rv rv-d2">
                <span className="ptime">Monatsende</span>
                <h3>Rechnungen, Mahnungen, Ablage</h3>
                <p>
                  Der Auftrag ist längst erledigt — aber Rechnung schreiben, nachfassen und ablegen kostet dich jeden
                  Monat einen ganzen Abend. Von Hand.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ ERGEBNISSE ============ */}
        <section className="flows" id="ergebnisse">
          <div className="wrap">
            <p className="eyebrow mono rv" style={{ color: 'var(--live)' }}>
              Was dann einfach läuft
            </p>
            <h2 className="rv rv-d1">Nicht noch ein KI-Tool. Ergebnisse, die du siehst.</h2>
            <p className="lede rv rv-d2">
              Axantilo liefert keine Demos und keine Konzepte, sondern Abläufe, die in deinem Betrieb echte Aufgaben
              erledigen. Zum Beispiel:
            </p>

            <div className="area rv">
              <div className="area-head">
                <span className="mono">Vertrieb &amp; Angebote</span>
                <hr />
              </div>
              <div className="fgrid">
                <div className="fcard rv">
                  <h3>Angebots-Autopilot</h3>
                  <p>Anfrage rein, Angebot raus: Axantilo zieht Kundendaten und Preise, formuliert den Entwurf — du gibst nur noch frei.</p>
                  <div className="fflow">
                    Anfrage → Entwurf + Freigabe → <b>Angebot raus in Minuten</b>
                  </div>
                </div>
                <div className="fcard rv rv-d1">
                  <h3>Follow-up-Serie</h3>
                  <p>Nach jedem Angebot die richtige Nachricht zur richtigen Zeit — Tag 3, Tag 7, Tag 14. Persönlich formuliert.</p>
                  <div className="fflow">
                    Angebot raus → Nachfassen T3/T7/T14 → <b>kein Lead vergessen</b>
                  </div>
                </div>
                <div className="fcard rv rv-d2">
                  <h3>Lead-Qualifizierung</h3>
                  <p>Neue Anfragen werden automatisch eingeordnet und beantwortet — die heißen landen sofort bei dir auf dem Tisch.</p>
                  <div className="fflow">
                    Anfrage → einordnen + antworten → <b>heiße Leads sofort oben</b>
                  </div>
                </div>
              </div>
            </div>

            <div className="area rv">
              <div className="area-head">
                <span className="mono">Kommunikation</span>
                <hr />
              </div>
              <div className="fgrid">
                <div className="fcard rv">
                  <h3>Posteingang-Triage</h3>
                  <p>Wichtiges oben, Routine vorbeantwortet, Spam weg. Du siehst nur noch, was wirklich deine Entscheidung braucht.</p>
                  <div className="fflow">
                    Mail rein → sortieren + Entwurf → <b>Postfach unter Kontrolle</b>
                  </div>
                </div>
                <div className="fcard rv rv-d1">
                  <h3>Antwort-Entwürfe</h3>
                  <p>Für wiederkehrende Anfragen liegt die Antwort schon im Entwurf — in deinem Ton, mit deinen Daten.</p>
                  <div className="fflow">
                    Anfrage → Entwurf in deinem Ton → <b>antworten in Sekunden</b>
                  </div>
                </div>
                <div className="fcard rv rv-d2">
                  <h3>Gesprächsnotizen</h3>
                  <p>Nach jedem Termin: Zusammenfassung, To-dos und CRM-Update — automatisch festgehalten statt nur im Kopf.</p>
                  <div className="fflow">
                    Termin vorbei → Notiz + CRM → <b>nichts geht verloren</b>
                  </div>
                </div>
              </div>
            </div>

            <div className="area rv">
              <div className="area-head">
                <span className="mono">Backoffice</span>
                <hr />
              </div>
              <div className="fgrid">
                <div className="fcard rv">
                  <h3>Rechnung &amp; Mahnwesen</h3>
                  <p>Auftrag erledigt? Rechnung, Zahlungserinnerung und Ablage laufen von selbst — sauber dokumentiert.</p>
                  <div className="fflow">
                    Auftrag fertig → Rechnung + Erinnerung → <b>Papierkram erledigt</b>
                  </div>
                </div>
                <div className="fcard rv rv-d1">
                  <h3>Berichte &amp; Reports</h3>
                  <p>Wochenbericht, Kennzahlen, Status an Kunden — fertig formuliert, bevor jemand danach fragt.</p>
                  <div className="fflow">
                    Daten → Bericht → <b>immer auskunftsfähig</b>
                  </div>
                </div>
                <div className="fcard rv rv-d2">
                  <h3>Datenpflege</h3>
                  <p>Neue Kontakte, geänderte Daten, doppelte Einträge: Deine Systeme bleiben synchron — ohne Copy-Paste.</p>
                  <div className="fflow">
                    Änderung → überall aktuell → <b>ein Stand, alle Systeme</b>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ ORCHESTRIEREN ============ */}
        <section className="compare">
          <div className="wrap">
            <p className="eyebrow mono rv">Prinzip Nr. 1</p>
            <h2 className="rv rv-d1">
              Wir sind kein neues System.
              <br />
              Wir sind der Grund, warum deine Systeme endlich zusammenarbeiten.
            </h2>
            <p className="lede rv rv-d2">
              Jede Software will, dass du zu ihr wechselst. Axantilo will das Gegenteil: Deine Tools bleiben — wir sind
              die Schicht, die bisher gefehlt hat.
            </p>
            <div className="cgrid">
              <div className="ccol ccol-old rv">
                <span className="ctag">Neues Tool einführen</span>
                <h3>Ersetzen</h3>
                <ul>
                  <li>
                    <CrossIc />
                    Datenmigration aus dem alten System
                  </li>
                  <li>
                    <CrossIc />
                    Team-Schulung und Eingewöhnung
                  </li>
                  <li>
                    <CrossIc />
                    Vertragsbindung und Setup-Gebühren
                  </li>
                  <li>
                    <CrossIc />
                    Wochen bis zum ersten Nutzen
                  </li>
                </ul>
              </div>
              <div className="ccol ccol-new rv rv-d1">
                <span className="ctag">Axantilo</span>
                <h3>Orchestrieren</h3>
                <ul>
                  <li>
                    <CheckIc />
                    CRM, Postfach &amp; Kalender bleiben
                  </li>
                  <li>
                    <CheckIc />
                    Fehlt ein Tool? Wir richten es für dich ein
                  </li>
                  <li>
                    <CheckIc />
                    Null Vorkenntnisse — der Chat erledigt das Setup
                  </li>
                  <li>
                    <CheckIc />
                    Ab Tag 1 produktiv, monatlich kündbar
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ============ AGENTUR VERGLEICH ============ */}
        <section className="agency" id="agency">
          <div className="wrap">
            <p className="eyebrow mono rv">Prinzip Nr. 2</p>
            <h2 className="rv rv-d1">
              Alles, was dir eine AI-Agentur baut.
              <br />
              Ohne Agentur.
            </h2>
            <p className="lede rv rv-d2">
              AI-Agenturen bauen dir genau das, was Axantilo kann — für ein Vielfaches, in Wochen statt Minuten, und
              jedes Mal wenn sich etwas ändert, zahlst du wieder.
            </p>

            <VsTable rows={VS_ROWS} />
          </div>
        </section>

        {/* ============ HOW IT WORKS ============ */}
        <section className="how" id="how">
          <div className="wrap">
            <p className="eyebrow mono rv">So funktioniert&apos;s</p>
            <h2 className="rv rv-d1">
              Kein Demo. Kein PDF.
              <br />
              Ein laufender Workflow.
            </h2>
            <div className="how-grid">
              <div className="steps">
                <div className="step rv">
                  <div className="step-num">01</div>
                  <div>
                    <h3>Erzähl es im Chat</h3>
                    <p>
                      Du beschreibst, was bei dir liegen bleibt — Angebote, Mails, Abrechnung, egal was. Axantilo kennt
                      die typischen Abläufe und fragt nur nach deinen Details.
                    </p>
                  </div>
                </div>
                <div className="step rv rv-d1">
                  <div className="step-num">02</div>
                  <div>
                    <h3>Wir verbinden deine Tools</h3>
                    <p>
                      Axantilo verbindet sich mit Postfach, Tabellen, CRM und Kalender. Fehlt ein Baustein, richten wir
                      ihn automatisch mit ein.
                    </p>
                  </div>
                </div>
                <div className="step rv rv-d2">
                  <div className="step-num">03</div>
                  <div>
                    <h3>Es läuft</h3>
                    <p>
                      Der Workflow ist live — noch im selben Gespräch. Du siehst jede Aktion im Protokoll, kannst alles
                      pausieren und jederzeit im Chat anpassen.
                    </p>
                  </div>
                </div>
              </div>

              <ChatDemo title="Axantilo Onboarding · Live" lines={CHAT_LINES} />
            </div>
          </div>
        </section>

        {/* ============ INTEGRATIONS ============ */}
        <section className="integr">
          <div className="wrap">
            <p className="eyebrow mono rv">Arbeitet mit deinem Stack</p>
            <h2 className="rv rv-d1" style={{ fontSize: 'clamp(1.4rem,2.4vw,1.9rem)' }}>
              Über 1.800 Integrationen — wir haben auch deine Tools.
            </h2>
            <IntegrationChips
              items={INTEGRATIONS}
              moreLabel="+ über 1.800 weitere — du verbindest nur, was der Ablauf braucht."
            />
          </div>
        </section>

        {/* ============ FINAL CTA ============ */}
        <section className="final" id="cta">
          <div className="wrap">
            <div className="countchip mono rv">
              <span className="logo-dot" />
              Vom Gespräch zur laufenden Automatisierung
            </div>
            <h2 className="rv rv-d1">
              Morgen kommen wieder Angebote, Mails und Rechnungen.
              <br />
              Lass sie zum ersten Mal von selbst laufen.
            </h2>
            <p className="lede rv rv-d2">
              Starte kostenlos: Axantilo führt dich durchs Gespräch, findet deinen größten Hebel — und baut die erste
              Automatisierung noch heute.
            </p>
            <div className="hero-ctas rv rv-d3">
              <Link href="/onboarding" className="btn btn-live">
                Kostenlos starten
              </Link>
            </div>
            <p className="hero-note rv rv-d4">Keine Kreditkarte nötig · DSGVO-konform · EU-Hosting</p>
          </div>
        </section>

        <footer>
          <div className="wrap foot">
            <span>©️ 2026 Axantilo · Graz, Österreich</span>
            <div className="foot-links">
              <Link href="/immobilienmakler">Für Immobilienmakler</Link>
              <Link href="/impressum">Impressum</Link>
              <Link href="/datenschutz">Datenschutz</Link>
              <Link href="/agb">AGB</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
