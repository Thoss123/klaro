import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/impressum', '/datenschutz', '/agb'],
      disallow: ['/chat', '/canvas/', '/dashboard', '/workflows', '/onboarding', '/admin', '/login', '/api/'],
    },
    sitemap: 'https://axantilo.com/sitemap.xml',
  };
}
