import { describe, expect, it } from 'vitest';
import {
  isOAuthCredentialType,
  providerForCredentialType,
  providerForN8nNode,
  resolveOAuthProvider,
} from '@/lib/oauth-config';

describe('oauth-config', () => {
  it('erkennt Google-OAuth-Credential-Typen', () => {
    expect(providerForCredentialType('gmailOAuth2')).toBe('google');
    expect(providerForCredentialType('googleSheetsOAuth2Api')).toBe('google');
    expect(providerForCredentialType('googleCalendarOAuth2Api')).toBe('google');
    expect(isOAuthCredentialType('googleDocsOAuth2Api')).toBe(true);
  });

  it('schließt Google-API-Key-Typen von OAuth aus', () => {
    expect(providerForCredentialType('googleApi')).toBeNull();
    expect(providerForCredentialType('googlePalmApi')).toBeNull();
    expect(isOAuthCredentialType('googleApi')).toBe(false);
  });

  it('erkennt prefixed Katalog-Namen', () => {
    expect(providerForCredentialType('n8n-nodes-base.gmailOAuth2')).toBe('google');
    expect(providerForCredentialType('n8n-nodes-base.googleCalendarOAuth2Api')).toBe('google');
    expect(providerForCredentialType('n8n-nodes-base.microsoftOutlookOAuth2Api')).toBe('microsoft');
    expect(providerForCredentialType('n8n-nodes-base.microsoftTeamsOAuth2Api')).toBe('microsoft');
    expect(isOAuthCredentialType('n8n-nodes-base.googleApi')).toBe(false);
    expect(isOAuthCredentialType('n8n-nodes-base.microsoftSql')).toBe(false);
  });

  it('erkennt Microsoft-OAuth', () => {
    expect(providerForCredentialType('microsoftOutlookOAuth2Api')).toBe('microsoft');
    expect(providerForCredentialType('microsoftTeamsOAuth2Api')).toBe('microsoft');
    expect(providerForCredentialType('microsoftSql')).toBeNull();
  });

  it('erkennt OAuth-Provider aus n8n-Node-Typ', () => {
    expect(providerForN8nNode('n8n-nodes-base.microsoftOutlook')).toBe('microsoft');
    expect(providerForN8nNode('n8n-nodes-base.microsoftTeams')).toBe('microsoft');
    expect(providerForN8nNode('n8n-nodes-base.gmail')).toBe('google');
    expect(providerForN8nNode('n8n-nodes-base.lmChatGoogleGemini')).toBeNull();
  });

  it('resolveOAuthProvider nutzt Credential- oder Node-Fallback', () => {
    expect(resolveOAuthProvider(null, 'n8n-nodes-base.microsoftOutlook')).toBe('microsoft');
    expect(resolveOAuthProvider('n8n-nodes-base.gmailOAuth2', null)).toBe('google');
  });
});
