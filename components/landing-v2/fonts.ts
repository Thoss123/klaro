import { Bricolage_Grotesque, Instrument_Sans, Caveat } from 'next/font/google';

// Gemeinsame Fonts für die Landing-v2-Seiten (/ und /immobilienmakler).
export const displayFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-display',
});

export const bodyFont = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
});

export const accentFont = Caveat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-accent',
});

export const landingFontVars = `${displayFont.variable} ${bodyFont.variable} ${accentFont.variable}`;
