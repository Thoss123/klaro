import { describe, expect, it } from 'vitest';
import {
  BERND_MAIL_CONNECTIONS,
  detectBerndMailProvider,
  mailToolName,
  resolveBerndMailProvider,
} from '@/lib/bernd/mail-provider';

describe('Bernd mail provider', () => {
  it('respects the provider selected in the wizard', () => {
    expect(resolveBerndMailProvider({ genutzt: ['outlook'] })).toBe('outlook');
    expect(resolveBerndMailProvider({ genutzt: ['gmail'] })).toBe('gmail');
    expect(resolveBerndMailProvider({ mail_provider: 'outlook', genutzt: ['gmail'] })).toBe('outlook');
    expect(detectBerndMailProvider({})).toBeNull();
    expect(resolveBerndMailProvider({}, { ablauf: { email_triage: { mail_provider: 'Outlook' } } })).toBe('outlook');
  });

  it('uses n8n credential types accepted by the configured instance', () => {
    expect(BERND_MAIL_CONNECTIONS.gmail.credentialType).toBe('gmailOAuth2');
    expect(BERND_MAIL_CONNECTIONS.outlook.credentialType).toBe('microsoftOutlookOAuth2Api');
    expect(mailToolName('outlook')).toBe('outlook');
  });
});
