/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    // Tool-Favicons in der Integrations-Sektion der Landingpages.
    remotePatterns: [{ protocol: 'https', hostname: 'www.google.com', pathname: '/s2/favicons' }],
  },
  // Coach-v2-Prompts werden zur Laufzeit per fs gelesen — beim Deploy mitnehmen.
  outputFileTracingIncludes: {
    '/api/chat': ['./coach/prompts/**', './knowledge/mindset.md'],
  },
};

export default nextConfig;
