/**
 * Seed personas — the synthetic customers you drive with "start test with
 * profil 2". Code-defined so they're versioned with the prompts they test;
 * seedPersonas() upserts them into sim_personas for the dev UI to list.
 */

import type { Persona } from './types';

export const SEED_PERSONAS: Persona[] = [
  {
    slug: 'profil-1',
    label: 'Bäckerei mit 8 Filialen — bodenständig, nicht-technisch',
    onboarding: {
      firmenname: 'Bäckerei Hofmann',
      vorname: 'Markus',
      branche: 'Lebensmittelhandwerk / Bäckerei',
      rolle_im_unternehmen: 'Inhaber',
      unternehmensgroesse: '11-50',
      ziel: 'Ich weiß noch nicht genau, wo ich anfangen soll',
      ki_erfahrung: 'keine',
      technik_level: 'niedrig',
      wer_setzt_um: 'externe Hilfe',
      tempo: 'gründlich',
    },
    behavior: {
      vagueness: 0.7,
      tangents: 0.6,
      skepticism: 0.5,
      techLiteracy: 0.1,
      notes: 'Redet über das Tagesgeschäft, nennt Tools nur als „das Programm" oder „die Excel-Liste".',
    },
    groundTruth: {
      expectedPainPoints: [
        'Bestellungen der Filialen werden morgens telefonisch/handschriftlich gesammelt',
        'Personalplanung läuft über ausgedruckte Wochenpläne',
        'Lieferanten-Rechnungen werden manuell abgetippt',
      ],
      toolsInUse: ['Excel', 'WhatsApp', 'Telefon', 'DATEV (beim Steuerberater)'],
      realisticAutomations: [
        'Digitales Bestellformular je Filiale, das die Mengen automatisch zusammenführt',
        'Erinnerungs-Mails/WhatsApp an Filialleiter zu festen Zeiten',
      ],
      impracticalIdeas: [
        'KI-gestützte Absatzprognose pro Brötchensorte (zu wenig saubere Daten vorhanden)',
        'Vollautomatische Personaleinsatzplanung per KI',
      ],
    },
  },
  {
    slug: 'profil-2',
    label: 'Steuerkanzlei — mittel-technisch, skeptisch, konkrete Ideen',
    onboarding: {
      firmenname: 'Kanzlei Brandt & Partner',
      vorname: 'Stefan',
      branche: 'Steuerberatung',
      rolle_im_unternehmen: 'Partner',
      unternehmensgroesse: '11-50',
      ziel: 'Ich habe schon konkrete Ideen',
      ki_erfahrung: 'etwas',
      technik_level: 'mittel',
      wer_setzt_um: 'jemand im Team',
      tempo: 'zügig',
    },
    behavior: {
      vagueness: 0.3,
      tangents: 0.2,
      skepticism: 0.8,
      techLiteracy: 0.6,
      notes: 'Datenschutz-sensibel (Mandantendaten), fragt kritisch nach Aufwand und Kosten.',
    },
    groundTruth: {
      expectedPainPoints: [
        'Mandanten reichen Belege unsortiert per E-Mail ein',
        'Fristen werden in Outlook-Kalender händisch gepflegt',
        'Wiederkehrende Mandantenfragen binden viel Zeit',
      ],
      toolsInUse: ['DATEV', 'Outlook', 'Microsoft 365', 'SharePoint'],
      realisticAutomations: [
        'Automatische Beleg-Eingangsbestätigung + Ablage nach Mandant',
        'Fristen-Erinnerungen aus einer zentralen Liste',
      ],
      impracticalIdeas: [
        'KI berät Mandanten eigenständig steuerlich (Haftung/Datenschutz)',
        'Vollautomatischer Versand von Steuererklärungen ohne Freigabe',
      ],
    },
  },
  {
    slug: 'profil-3',
    label: 'E-Commerce-Shop — technisch versiert, will nur umsetzen',
    onboarding: {
      firmenname: 'Nordlicht Outdoor GmbH',
      vorname: 'Jonas',
      branche: 'E-Commerce / Outdoor-Ausrüstung',
      rolle_im_unternehmen: 'Geschäftsführer',
      unternehmensgroesse: '1-10',
      ziel: 'Ich habe einen genauen Plan und will nur umsetzen',
      ki_erfahrung: 'viel',
      technik_level: 'hoch',
      wer_setzt_um: 'ich selbst',
      tempo: 'zügig',
    },
    behavior: {
      vagueness: 0.15,
      tangents: 0.1,
      skepticism: 0.4,
      techLiteracy: 0.9,
      notes: 'Nennt Tools und APIs präzise, ungeduldig bei Grundlagen-Fragen.',
    },
    groundTruth: {
      expectedPainPoints: [
        'Retouren-Anfragen werden manuell in Shopify und per Mail bearbeitet',
        'Lagerbestand wird zwischen Shop und Großhändler manuell abgeglichen',
        'Bewertungs-Anfragen werden nicht systematisch verschickt',
      ],
      toolsInUse: ['Shopify', 'Klaviyo', 'Google Sheets', 'Slack', 'Gmail'],
      realisticAutomations: [
        'Automatischer Retouren-Workflow mit Label-Erstellung',
        'Post-Purchase-Mailstrecke für Bewertungen über Klaviyo',
        'Lagerabgleich Shopify ↔ Lieferanten-Feed per Schedule',
      ],
      impracticalIdeas: [
        'Vollautomatische dynamische Preisgestaltung per KI ohne Kontrolle',
      ],
    },
  },
  {
    slug: 'profil-4',
    label: 'Webdesign-Agentur — mittel-technisch, will Prozesse straffen',
    onboarding: {
      firmenname: 'Pixelwerk Studio',
      vorname: 'Lena',
      branche: 'Webdesign- & Marketing-Agentur',
      rolle_im_unternehmen: 'Inhaberin / Creative Director',
      unternehmensgroesse: '1-10',
      ziel: 'Ich weiß noch nicht genau, wo ich anfangen soll',
      ki_erfahrung: 'etwas',
      technik_level: 'mittel',
      wer_setzt_um: 'jemand im Team',
      tempo: 'zügig',
    },
    behavior: {
      vagueness: 0.4,
      tangents: 0.4,
      skepticism: 0.5,
      techLiteracy: 0.6,
      notes: 'Denkt in Projekten/Kunden, nennt Tools wie Figma/Notion beiläufig; sorgt sich, dass Automatisierung unpersönlich wirkt.',
    },
    groundTruth: {
      expectedPainPoints: [
        'Angebots- und Projektanfragen kommen unstrukturiert per Mail/Kontaktformular und werden manuell sortiert',
        'Onboarding neuer Kunden (Zugänge, Briefing, Assets sammeln) ist jedes Mal Handarbeit',
        'Statusupdates an Kunden und Feedback-Schleifen kosten viel Hin und Her',
        'Rechnungsstellung am Projektende wird manuell aus Stundenzetteln gebaut',
      ],
      toolsInUse: ['Figma', 'Notion', 'Slack', 'Gmail', 'Google Workspace', 'Stripe', 'Trello'],
      realisticAutomations: [
        'Anfrage-Formular → automatische Qualifizierung + Aufgabe/Karte im Projektboard',
        'Kunden-Onboarding-Strecke: automatische Mails mit Briefing-Formular + Asset-Upload-Link',
        'Automatische Projekt-Statusmails aus dem Projektboard-Status',
        'Rechnungsentwurf aus erfassten Stunden in Stripe',
      ],
      impracticalIdeas: [
        'KI entwirft eigenständig fertige Designs ohne Designer-Kontrolle (Qualität/Marke)',
        'Vollautomatische Angebotskalkulation ohne menschliche Freigabe bei individuellen Projekten',
      ],
    },
  },
  {
    slug: 'immomakler',
    label: 'Immobilienmakler — Ein-Mann-Büro, versinkt in Portalanfragen',
    onboarding: {
      firmenname: 'Weber Immobilien',
      vorname: 'Andreas',
      branche: 'Immobilienmakler',
      rolle_im_unternehmen: 'Inhaber',
      unternehmensgroesse: '1-10',
      ziel: 'Ich weiß noch nicht genau, wo ich anfangen soll',
      ki_erfahrung: 'etwas',
      technik_level: 'mittel',
      wer_setzt_um: 'ich selbst',
      tempo: 'zügig',
    },
    behavior: {
      vagueness: 0.35,
      tangents: 0.3,
      skepticism: 0.5,
      techLiteracy: 0.5,
      notes: 'Denkt in Objekten und Interessenten, nennt justimmo/ImmoScout24/willhaben beiläufig; klagt über Abendarbeit wegen später Portalanfragen.',
    },
    groundTruth: {
      expectedPainPoints: [
        'Portalanfragen (ImmoScout24, willhaben) kommen abends/nachts rein und werden erst am nächsten Tag beantwortet',
        'Exposés werden manuell aus Fotos, Texten und Layout gebaut — dauert Stunden pro Objekt',
        'Nach Besichtigungen wird nicht systematisch nachgefasst',
        'Neue Objekte werden nicht automatisch mit passenden Interessenten aus dem Bestand abgeglichen',
      ],
      toolsInUse: ['justimmo', 'ImmoScout24', 'willhaben', 'E-Mail', 'Kalender'],
      realisticAutomations: [
        'Portalanfrage automatisch qualifizieren, mit Exposé + Terminvorschlag sofort beantworten',
        'Besichtigungs-Follow-up nach festem Rhythmus (z.B. Tag 1/3/7)',
        'Neues Objekt automatisch gegen Interessenten-Datenbank matchen',
        'Exposé-Entwurf aus justimmo-Objektdaten generieren',
      ],
      impracticalIdeas: [
        'Vollautomatische Preisverhandlung mit Interessenten ohne Makler',
        'KI erstellt rechtsverbindliche Kaufverträge ohne Notar/Anwalt-Prüfung',
      ],
    },
  },
];

export function getPersona(slug: string): Persona | undefined {
  return SEED_PERSONAS.find(p => p.slug === slug);
}
