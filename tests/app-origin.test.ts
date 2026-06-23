import { describe, expect, it } from 'vitest';
import { authCallbackUrl, getRequestOrigin } from '@/lib/app-origin';

describe('app-origin', () => {
  it('getRequestOrigin nutzt x-forwarded-host auf Vercel/Proxy', () => {
    const req = new Request('http://localhost:3000/api/oauth/google', {
      headers: {
        'x-forwarded-host': 'axantilo.com',
        'x-forwarded-proto': 'https',
      },
    });
    expect(getRequestOrigin(req)).toBe('https://axantilo.com');
  });

  it('getRequestOrigin fällt auf request.url zurück ohne Proxy-Headers', () => {
    const req = new Request('http://localhost:3000/api/auth/callback');
    expect(getRequestOrigin(req)).toBe('http://localhost:3000');
  });

  it('authCallbackUrl behält next-Pfad bei', () => {
    expect(authCallbackUrl('https://axantilo.com', '/onboarding')).toBe(
      'https://axantilo.com/api/auth/callback?next=%2Fonboarding',
    );
  });

  it('authCallbackUrl ohne next = Basis-Callback', () => {
    expect(authCallbackUrl('https://axantilo.com')).toBe(
      'https://axantilo.com/api/auth/callback',
    );
  });
});
