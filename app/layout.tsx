import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Axantilo – KI-Automatisierung für Ihr Unternehmen",
  description:
    "Axantilo analysiert Ihre Arbeitsprozesse und baut automatisch passgenaue KI-Workflows – ohne Programmierkenntnisse. Sparen Sie täglich Stunden manueller Arbeit.",
  keywords: [
    "KI Automatisierung",
    "Workflow Automatisierung",
    "n8n",
    "KI Coach",
    "Prozessautomatisierung",
    "Österreich",
    "KMU",
    "AI Automation",
  ],
  authors: [{ name: "Axantilo" }],
  creator: "Axantilo",
  metadataBase: new URL("https://axantilo.com"),
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/icon1.png", type: "image/png" },
      { url: "/icon0.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    apple: "/apple-icon.png",
  },
  appleWebApp: {
    title: "Axantilo",
    statusBarStyle: "black-translucent",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "Axantilo – KI-Automatisierung für Ihr Unternehmen",
    description:
      "Axantilo analysiert Ihre Arbeitsprozesse und baut automatisch passgenaue KI-Workflows – ohne Programmierkenntnisse.",
    url: "https://axantilo.com",
    siteName: "Axantilo",
    locale: "de_AT",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Axantilo – KI-Automatisierung für Ihr Unternehmen",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Axantilo – KI-Automatisierung für Ihr Unternehmen",
    description:
      "Axantilo analysiert Ihre Arbeitsprozesse und baut automatisch passgenaue KI-Workflows – ohne Programmierkenntnisse.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
