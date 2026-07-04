import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/immobilienmakler', '/warteliste', '/impressum', '/datenschutz', '/agb'],
      disallow: ['/chat', '/canvas/', '/dashboard', '/onboarding', '/admin', '/login', '/api/'],
    },
    sitemap: 'https://axantilo.com/sitemap.xml',
  };
}
