'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { SiGmail, SiGooglecalendar, SiGooglesheets, SiInstagram, SiMeta, SiWhatsapp } from 'react-icons/si';
import WaitlistWizard from '@/components/waitlist/WaitlistWizard';
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
        <span className="vs-price">ab €49/Monat</span> — keine Setup-Gebühr, monatlich kündbar
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
    neu: 'Null. Axantilo kennt die Makler-Prozesse und fragt nur nach deinen Variablen.',
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
  { label: 'justimmo', domain: 'justimmo.at' },
  { label: 'onOffice', domain: 'onoffice.com' },
  { label: 'ImmoScout24', domain: 'immobilienscout24.at' },
  { label: 'willhaben', domain: 'willhaben.at' },
  { label: 'Gmail', icon: <SiGmail size={18} color="#EA4335" /> },
  { label: 'Outlook', domain: 'outlook.com' },
  { label: 'Google Kalender', icon: <SiGooglecalendar size={18} color="#4285F4" /> },
  { label: 'Google Sheets', icon: <SiGooglesheets size={18} color="#34A853" /> },
  { label: 'WhatsApp Business', icon: <SiWhatsapp size={18} color="#25D366" /> },
  { label: 'Meta Ads', icon: <SiMeta size={18} color="#0866FF" /> },
  { label: 'Instagram', icon: <SiInstagram size={18} color="#E4405F" /> },
];

const CHAT_LINES: ChatLine[] = [
  {
    role: 'ai',
    text: 'Hallo! Ich kenne das Maklergeschäft — von der Anfrage bis zur Abrechnung. Was frisst bei dir am meisten Zeit?',
  },
  {
    role: 'user',
    text: 'Exposés dauern ewig, und Portalanfragen beantworte ich oft erst am nächsten Tag.',
  },
  {
    role: 'ai',
    text: 'Übernehme ich beides: Exposés erstelle ich direkt aus deinen justimmo-Daten, Anfragen beantworte ich sofort mit Exposé und Terminvorschlag. Welchen Kalender nutzt du?',
  },
  { role: 'user', text: 'Google Kalender.' },
  {
    role: 'ai',
    text: 'Perfekt. Ich verbinde justimmo, willhaben und deinen Kalender — ein Buchungstool für Besichtigungen richte ich dir gleich mit ein.',
  },
  { role: 'sys', text: '✓ 2 Workflows deployed — laufen' },
];

export default function MaklerLanding() {
  const isDev = process.env.NODE_ENV === 'development';
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  const openWaitlist = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    setWaitlistOpen(true);
    document.body.style.overflow = 'hidden';
    window.history.replaceState(null, '', '#warteliste');
  }, []);

  const closeWaitlist = useCallback(() => {
    setWaitlistOpen(false);
    document.body.style.overflow = '';
    if (window.location.hash === '#warteliste') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (window.location.hash !== '#warteliste') return;
    // Nach dem ersten Frame öffnen — kein synchrones setState im Effect-Body.
    const raf = requestAnimationFrame(() => {
      setWaitlistOpen(true);
      document.body.style.overflow = 'hidden';
    });
    return () => cancelAnimationFrame(raf);
  }, []);

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
              <a href="#flows">Was alles läuft</a>
              <a href="#agency">Vs. AI-Agentur</a>
              <a href="#how">So funktioniert&apos;s</a>
              <a href="#pricing">Testphase</a>
              {isDev && (
                <Link href="/login" className="nav-login">
                  Login
                </Link>
              )}
              <a href="/warteliste" className="btn btn-live" onClick={openWaitlist}>
                Early Access
              </a>
            </div>
          </div>
        </nav>

        {/* ============ HERO ============ */}
        <header className="hero" id="top">
          <div className="wrap">
            <h1 className="rv rv-d1">
              Dein ganzes Maklergeschäft.
              <br />
              <em>Läuft von selbst.</em>
            </h1>
            <p className="hero-sub rv rv-d2">
              Von der Portalanfrage bis zur Provisionsrechnung: Axantilo orchestriert deine bestehenden Tools und erledigt
              die Arbeit dazwischen — Exposés, Follow-ups, Ads, Rundgang-Termine, Abrechnung. Eingerichtet in einem
              Gespräch, nicht in einem IT-Projekt.
            </p>
            <div className="hero-ctas rv rv-d3">
              <a href="/warteliste" className="btn btn-live" onClick={openWaitlist}>
                Early Access sichern
              </a>
              <a href="#flows" className="btn btn-ghost">
                Was alles läuft
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
                <b>✓</b> Bruchteil der Agenturkosten
              </span>
            </div>

            <OrchestrationGraph
              idPrefix="mk"
              inputs={[
                { label: 'Portale', sub: 'ImmoScout24 · willhaben' },
                { label: 'Justimmo', sub: 'Objekte & Kontakte' },
                { label: 'Postfach', sub: 'Gmail · Outlook' },
                { label: 'Kalender', sub: 'Termine & Rundgänge' },
              ]}
              outputs={[
                { label: 'Anfrage beantwortet', sub: 'in 4 Minuten, mit Exposé' },
                { label: 'Exposé erstellt', sub: 'Text, Layout, Rundgang-Link' },
                { label: 'Anzeige geschaltet', sub: 'Meta & Portale, automatisch' },
                { label: 'Rechnung gestellt', sub: 'nach Abschluss, inkl. Ablage' },
              ]}
              coreSub={['versteht · erstellt ·', 'plant · rechnet ab']}
              ariaDesktop="Diagramm: Portale, justimmo, E-Mail und Kalender fließen durch Axantilo — heraus kommen beantwortete Anfragen, fertige Exposés, geschaltete Anzeigen und gestellte Rechnungen."
              ariaMobile="Mobil: Deine Tools fließen durch Axantilo — heraus kommen automatisch erledigte Anfragen, Exposés, Anzeigen und Rechnungen."
            />
          </div>
        </header>

        {/* ============ PROBLEM ============ */}
        <section className="problem">
          <div className="wrap">
            <p className="eyebrow mono rv">Der Makleralltag heute</p>
            <h2 className="rv rv-d1">
              Du bist Verkäufer, Texter, Fotograf, Werbeagentur und Buchhaltung. Jeden Tag. Gleichzeitig.
            </h2>
            <div className="pgrid">
              <div className="pcard rv">
                <span className="ptime">22:41 Uhr</span>
                <h3>Die Anfrage von gestern Abend</h3>
                <p>
                  Portalanfrage um 22:41. Deine Antwort kommt morgen Vormittag — der Interessent hat bis dahin drei andere
                  Makler kontaktiert.
                </p>
              </div>
              <div className="pcard rv rv-d1">
                <span className="ptime">3 Std / Objekt</span>
                <h3>Das Exposé, das dich blockiert</h3>
                <p>
                  Fotos sortieren, Texte formulieren, Layout bauen, Rundgang-Link einfügen, auf drei Portale hochladen.
                  Drei Stunden, in denen du nicht verkaufst.
                </p>
              </div>
              <div className="pcard rv rv-d2">
                <span className="ptime">Nach dem Notar</span>
                <h3>Der Papierkram nach dem Abschluss</h3>
                <p>
                  Der schönste Moment im Maklerleben — gefolgt von Provisionsrechnung, Ablage, Eigentümer-Info und dem
                  Update in vier Systemen. Von Hand.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ WORKFLOWS / COVERAGE ============ */}
        <section className="flows" id="flows">
          <div className="wrap">
            <p className="eyebrow mono rv" style={{ color: 'var(--live)' }}>
              Der ganzheitliche Ansatz
            </p>
            <h2 className="rv rv-d1">Nicht ein Workflow. Dein ganzer Betrieb.</h2>
            <p className="lede rv rv-d2">
              Vertrieb, Marketing, Backoffice — Axantilo deckt das komplette Maklergeschäft ab. Alles fertig gebaut, du
              konfigurierst nur noch deine Variablen.
            </p>

            <div className="area rv">
              <div className="area-head">
                <span className="mono">Vertrieb</span>
                <hr />
              </div>
              <div className="fgrid">
                <div className="fcard rv">
                  <h3>Anfragen-Autopilot</h3>
                  <p>Jede Portalanfrage sofort qualifiziert und beantwortet — mit Exposé und Terminvorschlag. Auch um 22:41 Uhr.</p>
                  <div className="fflow">
                    Anfrage → qualifizieren → Exposé + Termin → <b>beantwortet in Minuten</b>
                  </div>
                </div>
                <div className="fcard rv rv-d1">
                  <h3>Besichtigungs-Follow-up</h3>
                  <p>Nach jedem Termin die richtige Nachricht zur richtigen Zeit. Tag 1, Tag 3, Tag 7 — persönlich formuliert.</p>
                  <div className="fflow">
                    Termin vorbei → Nachfassen T1/T3/T7 → <b>kein Interessent vergessen</b>
                  </div>
                </div>
                <div className="fcard rv rv-d2">
                  <h3>Interessenten-Matching</h3>
                  <p>Neues Objekt? Alle passenden Interessenten aus deiner Datenbank werden informiert, bevor es auf dem Portal steht.</p>
                  <div className="fflow">
                    Neues Objekt → Datenbank-Match → <b>Verkauf vor dem Inserat</b>
                  </div>
                </div>
              </div>
            </div>

            <div className="area rv">
              <div className="area-head">
                <span className="mono">Marketing</span>
                <hr />
              </div>
              <div className="fgrid">
                <div className="fcard rv">
                  <h3>Exposé-Generator</h3>
                  <p>Aus den justimmo-Objektdaten entsteht das fertige Exposé: Beschreibung, Lagetext, Layout — in Minuten statt Stunden.</p>
                  <div className="fflow">
                    Objektdaten → AI-Text + Layout → <b>Exposé fertig in Minuten</b>
                  </div>
                </div>
                <div className="fcard rv rv-d1">
                  <h3>Ads &amp; Social Media</h3>
                  <p>Jedes neue Objekt wird automatisch zur fertigen Anzeige — Meta-Kampagne und Social-Posts inklusive, ohne Agentur.</p>
                  <div className="fflow">
                    Objekt live → Anzeige + Posts → <b>Reichweite ohne Agentur</b>
                  </div>
                </div>
                <div className="fcard rv rv-d2">
                  <h3>Digitale Rundgänge</h3>
                  <p>Rundgang-Link im Exposé, Selbstbuchung für Besichtigungen, automatische Bestätigungen — der Interessent bedient sich selbst.</p>
                  <div className="fflow">
                    Rundgang-Link → Selbstbuchung → <b>Termine ohne Telefonate</b>
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
                  <h3>Rechnung &amp; Provision</h3>
                  <p>Abschluss erfasst? Provisionsrechnung, Zahlungserinnerung und Ablage laufen automatisch — DSGVO-konform dokumentiert.</p>
                  <div className="fflow">
                    Abschluss → Rechnung + Mahnwesen → <b>Papierkram erledigt</b>
                  </div>
                </div>
                <div className="fcard rv rv-d1">
                  <h3>Eigentümer-Reporting</h3>
                  <p>Jeder Eigentümer bekommt automatisch seinen Statusbericht: Anfragen, Besichtigungen, Feedback. Ohne dass du ihn schreibst.</p>
                  <div className="fflow">
                    Aktivitäten → Wochenbericht → <b>Eigentümer immer informiert</b>
                  </div>
                </div>
                <div className="fcard rv rv-d2">
                  <h3>Eigentümer-Onboarding</h3>
                  <p>Neuer Vermittlungsauftrag? Willkommensmail, Unterlagen-Checkliste und Ersttermin gehen raus, bevor du den Stift weglegst.</p>
                  <div className="fflow">
                    Neuer Auftrag → Checkliste + Termin → <b>starker erster Eindruck</b>
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
              Jede Software will, dass du zu ihr wechselst. Axantilo will das Gegenteil: Deine Tools bleiben — wir sind die
              Schicht, die bisher gefehlt hat.
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
                    justimmo, Postfach &amp; Kalender bleiben
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
              AI-Agenturen bauen dir genau das, was Axantilo kann — für das Fünfzigfache, in Wochen statt Minuten, und
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
                      Du beschreibst, was bei dir liegen bleibt — Anfragen, Exposés, Abrechnung, egal was. Axantilo kennt
                      die Makler-Prozesse bereits und fragt nur nach deinen Variablen.
                    </p>
                  </div>
                </div>
                <div className="step rv rv-d1">
                  <div className="step-num">02</div>
                  <div>
                    <h3>Wir verbinden deine Tools</h3>
                    <p>
                      Axantilo verbindet sich mit justimmo, Postfach, Kalender und Portalen. Fehlt ein Baustein — etwa ein
                      Buchungstool — richten wir ihn automatisch mit ein.
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
              Über 1.800 Integrationen — verbunden, nicht ersetzt.
            </h2>
            <IntegrationChips
              items={INTEGRATIONS}
              moreLabel="+ über 1.800 weitere — fehlt eins? Wir richten es ein."
            />
          </div>
        </section>

        {/* ============ TESTPHASE (aktiv) ============ */}
        <section className="pricing" id="pricing">
          <div className="wrap">
            <p className="eyebrow mono rv">Testphase</p>
            <h2 className="rv rv-d1">
              Wir sind in der Testphase.
              <br />
              Und du kannst dabei sein.
            </h2>
            <p className="lede rv rv-d2">
              Axantilo läuft aktuell mit ausgewählten Maklern im Test. Jeder Testzugang enthält ein Credit-Kontingent —
              genug, um deine ersten Workflows live zu erleben.
            </p>
            <div className="prgrid">
              <div className="prcard prcard-pro rv">
                <span className="prbadge">Warteliste offen</span>
                <h3>Testzugang</h3>
                <div className="prprice">
                  €0<span> · Warteliste</span>
                </div>
                <p className="prsub">
                  Trag dich ein — Testplätze werden laufend freigeschaltet, mit der Chance auf kostenloses Testen.
                </p>
                <ul>
                  <li>
                    <CheckIc />
                    Inkludiertes Credit-Kontingent zum Testen
                  </li>
                  <li>
                    <CheckIc />
                    Zugriff auf die Makler-Workflows
                  </li>
                  <li>
                    <CheckIc />
                    Chat-Onboarding &amp; Aktionsprotokoll
                  </li>
                  <li>
                    <CheckIc />
                    DSGVO-konform, EU-Hosting
                  </li>
                </ul>
                <a href="/warteliste" className="btn btn-live" onClick={openWaitlist}>
                  Auf die Warteliste
                </a>
              </div>
              <div className="prcard rv rv-d1">
                <h3>Credit-Paket</h3>
                <div className="prprice">
                  €49<span> · mehr Credits</span>
                </div>
                <p className="prsub">Für alle, die intensiver testen wollen, sobald das Kontingent aufgebraucht ist.</p>
                <ul>
                  <li>
                    <CheckIc />
                    Erweitertes Credit-Kontingent
                  </li>
                  <li>
                    <CheckIc />
                    Mehrere Workflows parallel betreiben
                  </li>
                  <li>
                    <CheckIc />
                    Direkter Draht für Feedback &amp; Wünsche
                  </li>
                  <li>
                    <CheckIc />
                    Keine Bindung — Credits statt Abo
                  </li>
                </ul>
                <a href="/warteliste" className="btn btn-dark" onClick={openWaitlist}>
                  Credits anfragen
                </a>
              </div>
            </div>
            <p className="pr-note rv rv-d2">
              Die finalen Abo-Preise kommen zum Launch am 17. August. Wer in der Testphase dabei ist, bekommt sie zuerst —
              und zu Konditionen, die es danach nicht mehr gibt.
            </p>
          </div>
        </section>

        {/* ============ FINAL CTA ============ */}
        <section className="final" id="cta">
          <div className="wrap">
            <div className="countchip mono rv">
              <span className="logo-dot" />
              Launch 17. August · Early-Access-Plätze limitiert
            </div>
            <h2 className="rv rv-d1">
              Die nächste Anfrage kommt heute Abend.
              <br />
              Das nächste Exposé wartet morgen früh.
            </h2>
            <p className="lede rv rv-d2">
              Sichere dir Early Access: Wir richten deinen Betrieb gemeinsam ein — und du startest vor allen anderen.
            </p>
            <div className="hero-ctas rv rv-d3">
              <a href="/warteliste" className="btn btn-live" onClick={openWaitlist}>
                Auf die Warteliste
              </a>
            </div>
            <p className="hero-note rv rv-d4">
              hello@axantilo.com · Antwort innerhalb von 24 Stunden. Versprochen — und automatisiert.
            </p>
          </div>
        </section>

        <footer>
          <div className="wrap foot">
            <span>©️ 2026 Axantilo · Graz, Österreich</span>
            <div className="foot-links">
              <Link href="/impressum">Impressum</Link>
              <Link href="/datenschutz">Datenschutz</Link>
              <Link href="/agb">AGB</Link>
              <a href="mailto:hello@axantilo.com">Kontakt</a>
            </div>
          </div>
        </footer>
      </div>

      {waitlistOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-50 overflow-y-auto">
          <WaitlistWizard embedded onClose={closeWaitlist} />
        </div>
      )}
    </>
  );
}
