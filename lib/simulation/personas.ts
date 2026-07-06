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
  // ── 4 Immobilienmakler mit verschiedenen Einwänden, Problemen & Situationen ──
  {
    slug: 'immomakler-1-kontrolle',
    label: 'Immomakler Solo — orientierungslos, Einwand Kontrollverlust',
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
      hindernis: 'Bedenken, die Kontrolle zu verlieren',
      tempo: 'zügig',
    },
    behavior: {
      vagueness: 0.35,
      tangents: 0.3,
      skepticism: 0.6,
      techLiteracy: 0.5,
      notes:
        'Denkt in Objekten und Interessenten, nennt justimmo/ImmoScout24/willhaben beiläufig; klagt über Abendarbeit wegen später Portalanfragen. EINWAND (früh, ehrlich): fürchtet, dass eine KI in seinem Namen an Interessenten schreibt und dabei unpersönlich oder falsch wirkt — er will die Kontrolle behalten. Lässt sich mit dem Entwurfsmodus (Freigabe vor Versand) beruhigen, dann kooperativ.',
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
        'Portalanfrage automatisch qualifizieren, mit Exposé + Terminvorschlag sofort als Entwurf beantworten',
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
  {
    slug: 'immomakler-2-datenschutz',
    label: 'Immomakler kleines Team — skeptisch, Einwand Datenschutz/GwG',
    onboarding: {
      firmenname: 'Rheinblick Immobilien',
      vorname: 'Claudia',
      branche: 'Immobilienmakler',
      rolle_im_unternehmen: 'Geschäftsführerin',
      unternehmensgroesse: '2-5',
      ziel: 'Ich will erst prüfen, ob sich KI überhaupt lohnt',
      ki_erfahrung: 'wenig',
      technik_level: 'mittel',
      wer_setzt_um: 'jemand im Team',
      hindernis: 'Bedenken zu Datenschutz und Compliance',
      tempo: 'gründlich',
    },
    behavior: {
      vagueness: 0.4,
      tangents: 0.35,
      skepticism: 0.8,
      techLiteracy: 0.5,
      notes:
        'Verwaltet auch Mietobjekte, denkt viel an Eigentümer und Compliance. EINWAND (kommt immer wieder): Datenschutz und GwG — Interessentendaten, Selbstauskünfte, Ausweiskopien dürfen nicht in irgendeine US-Cloud oder ungeprüft durch eine KI. Will EU-Hosting/AVV hören und dass sensible Dokumente außen vor bleiben, bevor sie sich auf etwas einlässt. Grundton: „lohnt sich das für uns wirklich?"',
    },
    groundTruth: {
      expectedPainPoints: [
        'Eigentümer wollen wöchentlich Aktivitäts-Updates (Anfragen, Besichtigungen, Feedback) — jedes Update ist Handarbeit',
        'Exposés werden pro Objekt neu getextet und gelayoutet',
        'Besichtigungstermine werden per Telefon/Mail-Pingpong vereinbart, No-Shows ohne Erinnerung',
        'Interessenten-Rückfragen (Verfügbarkeit, Unterlagen) binden täglich Zeit',
      ],
      toolsInUse: ['onOffice', 'Outlook', 'ImmoScout24', 'Immowelt', 'Word'],
      realisticAutomations: [
        'Automatischer wöchentlicher Eigentümer-Report als Entwurf',
        'Exposé-Entwurf aus onOffice-Objektdaten',
        'Selbstbuchung von Besichtigungsterminen mit Bestätigung + Erinnerung',
      ],
      impracticalIdeas: [
        'Automatische Verarbeitung von Selbstauskünften/Ausweisdokumenten durch KI (Datenschutz/GwG)',
        'KI entscheidet ohne Makler über Mietinteressenten-Zusagen',
      ],
    },
  },
  {
    slug: 'immomakler-3-konkret',
    label: 'Immomakler technik-affin — hat konkrete Ideen, will Tempo',
    onboarding: {
      firmenname: 'Berg & Partner Immobilien',
      vorname: 'Tobias',
      branche: 'Immobilienmakler',
      rolle_im_unternehmen: 'Inhaber',
      unternehmensgroesse: '1-10',
      ziel: 'Ich habe schon konkrete Ideen',
      ki_erfahrung: 'fortgeschritten',
      technik_level: 'hoch',
      wer_setzt_um: 'ich selbst',
      hindernis: 'Bisher keine passenden Tools gefunden',
      tempo: 'schnell',
    },
    behavior: {
      vagueness: 0.15,
      tangents: 0.2,
      skepticism: 0.25,
      techLiteracy: 0.8,
      notes:
        'Weiß genau, was er will, nennt Tools präzise (Propstack, Meta Business Suite, ChatGPT, Zapier hat er mal probiert). Kaum Einwände — schon überzeugt, will Tempo und wenig Smalltalk. Kommt direkt mit zwei konkreten Ideen: Portalanfragen sofort automatisch beantworten und Social-Media-Posts für neue Objekte generieren. Wird ungeduldig, wenn der Coach zu breit ausholt.',
    },
    groundTruth: {
      expectedPainPoints: [
        'Portalanfragen werden zu langsam beantwortet, heiße Interessenten springen ab',
        'Social-Media-Vermarktung neuer Objekte bleibt im Tagesgeschäft liegen',
        'Exposé-Erstellung kostet trotz Software noch viel Texterei',
      ],
      toolsInUse: ['Propstack', 'ImmoScout24', 'Instagram', 'Meta Business Suite', 'ChatGPT'],
      realisticAutomations: [
        'Portalanfrage sofort qualifizieren und mit Exposé + Terminlink beantworten',
        'Aus Objektdaten automatisch Social-Media-Post-Entwürfe für Instagram/Facebook',
        'Exposé-Text-Entwurf aus Propstack-Objektdaten',
      ],
      impracticalIdeas: [
        'Vollautomatisches Posten ohne jede Freigabe auf allen Kanälen',
        'KI verhandelt eigenständig Preise mit Interessenten',
      ],
    },
  },
  {
    slug: 'immomakler-4-kosten',
    label: 'Immomakler größeres Büro — nicht-technisch, Einwand Kosten/Zeit',
    onboarding: {
      firmenname: 'Stadtquartier Immobilien',
      vorname: 'Petra',
      branche: 'Immobilienmakler',
      rolle_im_unternehmen: 'Büroleiterin',
      unternehmensgroesse: '6-20',
      ziel: 'Ich weiß noch nicht genau, wo ich anfangen soll',
      ki_erfahrung: 'keine',
      technik_level: 'niedrig',
      wer_setzt_um: 'jemand im Team',
      hindernis: 'Keine Zeit, sich damit zu beschäftigen',
      tempo: 'gründlich',
    },
    behavior: {
      vagueness: 0.6,
      tangents: 0.5,
      skepticism: 0.5,
      techLiteracy: 0.2,
      notes:
        'Koordiniert ein größeres Maklerbüro, spricht in Alltagssprache („das Programm", „die Liste"), nennt kaum Tool-Namen von selbst. EINWAND: sorgt sich um die Kosten neuer Tools und dass das Team (das schon am Limit ist) mit noch einer Software überfordert wird — „lohnt sich das bei uns überhaupt, und wer soll das pflegen?". Braucht die Kosten-als-Investition-Einordnung und die Zusage, dass Axantilo die Einrichtung übernimmt.',
    },
    groundTruth: {
      expectedPainPoints: [
        'Besichtigungstermine für mehrere Makler werden manuell koordiniert',
        'Rechnungen und Backoffice-Dokumente werden von Hand erstellt und abgelegt',
        'Eigentümer-Reportings werden von den Maklern einzeln zusammengesucht',
        'Neue Objekte werden nicht systematisch mit Interessenten abgeglichen',
      ],
      toolsInUse: ['FlowFact', 'Microsoft 365', 'Outlook', 'Excel', 'ImmoScout24'],
      realisticAutomations: [
        'Zentrale Besichtigungs-Terminbuchung mit Erinnerung',
        'Automatischer Eigentümer-Report je Objekt als Entwurf',
        'Interessenten-Matching bei neuen Objekten',
      ],
      impracticalIdeas: [
        'Komplett papierloses Vertragswesen ohne Anwalt/Notar per KI',
        'Vollautomatische Bonitätsentscheidung über Mietinteressenten',
      ],
    },
  },
];

export function getPersona(slug: string): Persona | undefined {
  return SEED_PERSONAS.find(p => p.slug === slug);
}
