'use client';

import { SiGmail, SiGoogledocs, SiTelegram, SiWhatsapp } from 'react-icons/si';
import { Camera, Mic, MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import { landingFontVars } from '@/components/landing-v2/fonts';
import { landingCss } from '@/components/landing-v2/styles';
import { useReveal } from '@/components/landing-v2/useReveal';
import OrchestrationGraph from '@/components/landing-v2/OrchestrationGraph';
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

const INTEGRATIONS: IntegrationItem[] = [
  { label: 'Telegram', icon: <SiTelegram size={18} color="#26A5E4" /> },
  { label: 'Gmail', icon: <SiGmail size={18} color="#EA4335" /> },
  { label: 'Outlook', domain: 'outlook.com' },
  { label: 'Google Docs', icon: <SiGoogledocs size={18} color="#4285F4" /> },
  { label: 'WhatsApp', icon: <SiWhatsapp size={18} color="#25D366" /> },
  { label: 'Herold.at', domain: 'herold.at' },
  { label: 'willhaben', domain: 'willhaben.at' },
];

const CHAT_LINES: ChatLine[] = [
  {
    role: 'ai',
    text: 'Hey! Ich bin Bernd. Schick mir einfach eine Sprachnachricht — wie mit einem Kollegen.',
  },
  {
    role: 'user',
    text: '🎤 "War grad bei Fam. Huber, Steckdosen im Keller erneuern, ca. 4 Stunden plus Material"',
  },
  {
    role: 'ai',
    text: 'Verstanden. Angebot für Fam. Huber ist fertig — 4 Std. à deinem Stundensatz plus Material mit Aufschlag. Soll ich es rausschicken?',
  },
  { role: 'user', text: 'Ja, schick raus.' },
  {
    role: 'ai',
    text: 'Erledigt ✓ Ich fasse in 3 Tagen automatisch nach, falls sich Familie Huber nicht meldet.',
  },
  { role: 'sys', text: '✓ Angebot gesendet — Nachfass-Serie aktiv' },
];

const GEWERKE = ['Elektriker', 'Maler', 'SHK', 'Tischler'];

export default function BerndLanding() {
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
              <a href="#flows">Was Bernd übernimmt</a>
              <a href="#multimodal">Sprache & Foto</a>
              <a href="#how">So funktioniert&apos;s</a>
              <a href="#pricing">Testphase</a>
              <Link href="/bernd/login" className="nav-login">
                Einloggen
              </Link>
              <Link href="/bernd/onboarding" className="btn btn-live">
                Bernd einrichten
              </Link>
            </div>
          </div>
        </nav>

        {/* ============ HERO ============ */}
        <header className="hero" id="top">
          <div className="wrap">
            <h1 className="rv rv-d1">
              Dein digitaler Mitarbeiter.
              <br />
              <em>Steuerst du per Telegram.</em>
            </h1>
            <p className="hero-sub rv rv-d2">
              Bernd schreibt Angebote, stellt Rechnungen, fasst bei Kunden nach und sortiert dein Postfach — du sagst
              ihm einfach, was zu tun ist. Per Text, per Sprachnachricht von der Baustelle, oder per Foto vom
              Lieferschein. Eingerichtet in einem Gespräch, kein IT-Projekt.
            </p>
            <div className="hero-ctas rv rv-d3">
              <Link href="/bernd/onboarding" className="btn btn-live">
                Bernd einrichten
              </Link>
              <a href="#flows" className="btn btn-ghost">
                Was Bernd übernimmt
              </a>
            </div>
            <div className="uspbar rv rv-d4">
              <span className="usp">
                <b>✓</b> Läuft komplett über Telegram
              </span>
              <span className="usp">
                <b>✓</b> Sprachnachricht & Foto statt Tastatur
              </span>
              <span className="usp">
                <b>✓</b> Für Elektriker, Maler, SHK, Tischler
              </span>
            </div>

            <OrchestrationGraph
              idPrefix="bd"
              inputs={[
                { label: 'Sprachnachricht', sub: 'von der Baustelle' },
                { label: 'Foto', sub: 'Lieferschein · Notizzettel' },
                { label: 'Text', sub: 'kurze Ansage in Telegram' },
                { label: 'Postfach', sub: 'Gmail · Outlook' },
              ]}
              outputs={[
                { label: 'Angebot verschickt', sub: 'aus deiner Preisliste' },
                { label: 'Rechnung gestellt', sub: 'inkl. Mahnlauf bei Verzug' },
                { label: 'Kunde nachgefasst', sub: 'automatisch, zur richtigen Zeit' },
                { label: 'Mail einsortiert', sub: 'Antwort-Entwurf steht bereit' },
              ]}
              coreSub={['versteht · schreibt ·', 'fasst nach · sortiert']}
              ariaDesktop="Diagramm: Sprachnachricht, Foto, Text und Postfach fließen durch Bernd — heraus kommen verschickte Angebote, gestellte Rechnungen, nachgefasste Kunden und sortierte Mails."
              ariaMobile="Mobil: Deine Nachrichten an Bernd fließen durch Axantilo — heraus kommen automatisch erledigte Angebote, Rechnungen, Nachfassen und Postfach."
            />
          </div>
        </header>

        {/* ============ PROBLEM ============ */}
        <section className="problem">
          <div className="wrap">
            <p className="eyebrow mono rv">Der Handwerkeralltag heute</p>
            <h2 className="rv rv-d1">
              Am Abend, wenn die Baustelle fertig ist, fängt die zweite Schicht erst an — Angebote, Rechnungen, Mails.
            </h2>
            <div className="pgrid">
              <div className="pcard rv">
                <span className="ptime">Küchentisch, 21 Uhr</span>
                <h3>Das Angebot, das liegen bleibt</h3>
                <p>
                  Besichtigung war vor drei Tagen. Das Angebot ist noch im Kopf — bis es aufgeschrieben ist, hat der
                  Kunde oft schon woanders angefragt.
                </p>
              </div>
              <div className="pcard rv rv-d1">
                <span className="ptime">Auf der Leiter</span>
                <h3>Das Handy, das ständig klingelt</h3>
                <p>
                  Mitten in der Arbeit eine Anfrage — entweder unterbrechen oder den Rückruf vergessen. Beides kostet
                  am Ende Aufträge.
                </p>
              </div>
              <div className="pcard rv rv-d2">
                <span className="ptime">Wochen später</span>
                <h3>Die Rechnung, die noch fehlt</h3>
                <p>
                  Auftrag erledigt, aber die Rechnung wartet auf „wenn mal Zeit ist&ldquo; — genau wie die Mahnung an den
                  Kunden, der noch nicht bezahlt hat.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ MULTIMODAL ============ */}
        <section className="compare" id="multimodal">
          <div className="wrap">
            <p className="eyebrow mono rv">Kein Tippen nötig</p>
            <h2 className="rv rv-d1">
              Du redest mit Bernd wie mit einem Kollegen.
              <br />
              Nicht wie mit einer Software.
            </h2>
            <p className="lede rv rv-d2">
              Text, Sprache oder Foto — Bernd versteht alle drei, direkt in Telegram. Genau da, wo du sowieso schon
              mit Kunden schreibst.
            </p>
            <div className="fgrid">
              <div className="fcard rv">
                <MessageSquareText size={22} color="#2F6BFF" style={{ marginBottom: 10 }} />
                <h3>Text</h3>
                <p>Kurze Ansage reicht: „Rechnung für Familie Huber, 4 Stunden plus Material&ldquo; — Bernd erledigt den Rest.</p>
              </div>
              <div className="fcard rv rv-d1">
                <Mic size={22} color="#2F6BFF" style={{ marginBottom: 10 }} />
                <h3>Sprachnachricht</h3>
                <p>Direkt von der Baustelle aufgenommen, während die Hände noch dreckig sind — Bernd transkribiert und versteht.</p>
              </div>
              <div className="fcard rv rv-d2">
                <Camera size={22} color="#2F6BFF" style={{ marginBottom: 10 }} />
                <h3>Foto</h3>
                <p>Lieferschein oder Notizzettel abfotografiert — Bernd liest Beträge und Material heraus und legt sie ab.</p>
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
            <h2 className="rv rv-d1">Nicht ein Trick. Deine ganze Bürozeit.</h2>
            <p className="lede rv rv-d2">
              Angebote, Rechnungen, Nachfassen, Postfach — Bernd deckt die komplette Büroarbeit rund um deine
              Aufträge ab. Fertig gebaut, du gibst nur deine Preise und Abläufe vor.
            </p>

            <div className="area rv">
              <div className="area-head">
                <span className="mono">Vertrieb</span>
                <hr />
              </div>
              <div className="fgrid">
                <div className="fcard rv">
                  <h3>Angebots-Autopilot</h3>
                  <p>Aus jeder Anfrage oder Besichtigungsnotiz entsteht in Minuten ein fertiger Angebotsentwurf — Freigabe per Telegram.</p>
                  <div className="fflow">
                    Anfrage/Notiz → Preise ziehen → Entwurf → <b>Freigabe per Telegram → raus</b>
                  </div>
                </div>
                <div className="fcard rv rv-d1">
                  <h3>Angebots-Nachfasser</h3>
                  <p>Kunde meldet sich nach dem Angebot nicht mehr? Bernd hakt automatisch dreistufig nach — T3, T7, T14.</p>
                  <div className="fflow">
                    Angebot raus → keine Antwort → Nachfassen T3/T7/T14 → <b>kein Kunde vergessen</b>
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
                  <h3>Rechnung & Mahnwesen</h3>
                  <p>Auftrag erledigt? Rechnung entsteht automatisch aus deiner Vorlage, Mahnlauf bei Zahlungsverzug läuft von selbst.</p>
                  <div className="fflow">
                    Auftrag fertig → Rechnung erzeugen → Mahnlauf bei Verzug → <b>Papierkram erledigt</b>
                  </div>
                </div>
                <div className="fcard rv rv-d1">
                  <h3>E-Mail Triage & Antwort-Entwurf</h3>
                  <p>Eingehende Mails werden einsortiert, Antwort-Entwürfe stehen bereit — du bestätigst nur noch.</p>
                  <div className="fflow">
                    Mail rein → einsortieren → Entwurf vorbereiten → <b>du bestätigst per Telegram</b>
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
              Wir sind der Mitarbeiter, der bisher gefehlt hat.
            </h2>
            <p className="lede rv rv-d2">
              Jede Software will, dass du zu ihr wechselst. Bernd nicht — er läuft dort, wo du sowieso schon mit
              Kunden schreibst: in Telegram.
            </p>
            <div className="cgrid">
              <div className="ccol ccol-old rv">
                <span className="ctag">Neue Software einführen</span>
                <h3>Ersetzen</h3>
                <ul>
                  <li>
                    <CrossIc />
                    Neue App, neues Login, neue Bedienung lernen
                  </li>
                  <li>
                    <CrossIc />
                    Alles per Tastatur, am Schreibtisch
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
                <span className="ctag">Bernd</span>
                <h3>Mitarbeiten</h3>
                <ul>
                  <li>
                    <CheckIc />
                    Telegram — kennst du schon, nichts Neues zu lernen
                  </li>
                  <li>
                    <CheckIc />
                    Sprachnachricht oder Foto statt Tippen
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

        {/* ============ GEWERKE ============ */}
        <section className="problem">
          <div className="wrap">
            <p className="eyebrow mono rv">Für dein Gewerk</p>
            <h2 className="rv rv-d1">Bernd kennt deinen Betrieb — egal welches Gewerk.</h2>
            <div className="pgrid">
              {GEWERKE.map((g, i) => (
                <div className={`pcard rv ${i > 0 ? `rv-d${Math.min(i, 3)}` : ''}`} key={g}>
                  <span className="ptime">{g}</span>
                  <h3>Typische Abläufe verstanden</h3>
                  <p>
                    Stundensatz, Materialaufschlag, Anfahrtspauschale, Auftragsarten — Bernd übernimmt deine
                    Preislogik statt sie neu zu erfinden.
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ HOW IT WORKS ============ */}
        <section className="how" id="how">
          <div className="wrap">
            <p className="eyebrow mono rv">So funktioniert&apos;s</p>
            <h2 className="rv rv-d1">
              Kein Demo. Kein PDF.
              <br />
              Ein Kollege, der ab morgen mitarbeitet.
            </h2>
            <div className="how-grid">
              <div className="steps">
                <div className="step rv">
                  <div className="step-num">01</div>
                  <div>
                    <h3>Erzähl uns von deinem Betrieb</h3>
                    <p>
                      Gewerk, Preislogik, genutzte Tools, größte Zeitfresser — in einem kurzen Wizard, danach noch ein
                      kurzer Chat für alles Weitere.
                    </p>
                  </div>
                </div>
                <div className="step rv rv-d1">
                  <div className="step-num">02</div>
                  <div>
                    <h3>Bernd wird eingerichtet</h3>
                    <p>
                      Angebote, Rechnungen, Nachfassen, Postfach — passend zu deinem Betrieb parametrisiert und
                      bereitgestellt.
                    </p>
                  </div>
                </div>
                <div className="step rv rv-d2">
                  <div className="step-num">03</div>
                  <div>
                    <h3>Du koppelst Telegram</h3>
                    <p>
                      Ein Link, ein Klick auf „Start&ldquo; — ab dann schreibst, sprichst oder fotografierst du einfach mit
                      Bernd.
                    </p>
                  </div>
                </div>
              </div>

              <ChatDemo title="Bernd · Telegram" lines={CHAT_LINES} />
            </div>
          </div>
        </section>

        {/* ============ INTEGRATIONS ============ */}
        <section className="integr">
          <div className="wrap">
            <p className="eyebrow mono rv">Arbeitet mit deinem Stack</p>
            <h2 className="rv rv-d1" style={{ fontSize: 'clamp(1.4rem,2.4vw,1.9rem)' }}>
              Telegram als Steuerzentrale — dein Postfach und deine Tools bleiben.
            </h2>
            <IntegrationChips
              items={INTEGRATIONS}
              moreLabel="+ weitere Tools — fehlt eins? Wir richten es ein."
            />
          </div>
        </section>

        {/* ============ TESTPHASE ============ */}
        <section className="pricing" id="pricing">
          <div className="wrap">
            <p className="eyebrow mono rv">Testphase</p>
            <h2 className="rv rv-d1">
              Wir sind in der Testphase.
              <br />
              Und du kannst dabei sein.
            </h2>
            <p className="lede rv rv-d2">
              Bernd läuft aktuell mit ausgewählten Handwerksbetrieben im Test. Jeder Testzugang enthält ein
              Credit-Kontingent — genug, um Bernd live zu erleben.
            </p>
            <div className="prgrid">
              <div className="prcard prcard-pro rv">
                <span className="prbadge">Jetzt einrichten</span>
                <h3>Testzugang</h3>
                <div className="prprice">
                  €0<span> · Testphase</span>
                </div>
                <p className="prsub">
                  Richte Bernd direkt ein — Testplätze werden laufend freigeschaltet, mit der Chance auf kostenloses
                  Testen.
                </p>
                <ul>
                  <li>
                    <CheckIc />
                    Inkludiertes Credit-Kontingent zum Testen
                  </li>
                  <li>
                    <CheckIc />
                    Zugriff auf alle Handwerker-Flows
                  </li>
                  <li>
                    <CheckIc />
                    Wizard + kurzer Chat statt IT-Projekt
                  </li>
                  <li>
                    <CheckIc />
                    DSGVO-konform, EU-Hosting
                  </li>
                </ul>
                <Link href="/bernd/onboarding" className="btn btn-live">
                  Bernd einrichten
                </Link>
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
                    Mehrere Flows parallel betreiben
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
                <a href="mailto:hello@axantilo.com" className="btn btn-dark">
                  Credits anfragen
                </a>
              </div>
            </div>
            <p className="pr-note rv rv-d2">
              Die finalen Abo-Preise kommen zum Launch. Wer in der Testphase dabei ist, bekommt sie zuerst — und zu
              Konditionen, die es danach nicht mehr gibt.
            </p>
          </div>
        </section>

        {/* ============ FINAL CTA ============ */}
        <section className="final" id="cta">
          <div className="wrap">
            <div className="countchip mono rv">
              <span className="logo-dot" />
              Testphase läuft · Plätze limitiert
            </div>
            <h2 className="rv rv-d1">
              Das nächste Angebot schreibt sich heute Abend.
              <br />
              Nicht du.
            </h2>
            <p className="lede rv rv-d2">
              Richte Bernd jetzt ein — Wizard und kurzer Chat, fertig eingerichtet noch heute.
            </p>
            <div className="hero-ctas rv rv-d3">
              <Link href="/bernd/onboarding" className="btn btn-live">
                Bernd einrichten
              </Link>
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
    </>
  );
}
