import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildCentralCredMap, centralCredentialId, isCentralCredential } from '@/lib/central-credentials';

const ENV_BACKUP = { ...process.env };

beforeEach(() => {
  delete process.env.N8N_CREDENTIAL_WORKSPACE_TOKEN;
  delete process.env.N8N_CREDENTIAL_SMTP;
  delete process.env.N8N_CREDENTIAL_TWILIO;
  delete process.env.N8N_CREDENTIAL_WHATSAPP;
});

afterEach(() => {
  process.env = { ...ENV_BACKUP };
});

describe('httpHeaderAuth central credential', () => {
  it('is recognized as a central credential type', () => {
    expect(isCentralCredential('httpHeaderAuth')).toBe(true);
  });

  it('returns undefined when N8N_CREDENTIAL_WORKSPACE_TOKEN is unset', () => {
    expect(centralCredentialId('httpHeaderAuth')).toBeUndefined();
  });

  it('returns the configured id when set', () => {
    process.env.N8N_CREDENTIAL_WORKSPACE_TOKEN = 'wtok-42';
    expect(centralCredentialId('httpHeaderAuth')).toBe('wtok-42');
  });

  it('is included in buildCentralCredMap once configured', () => {
    process.env.N8N_CREDENTIAL_WORKSPACE_TOKEN = 'wtok-42';
    process.env.N8N_CREDENTIAL_SMTP = 'smtp-1';
    const map = buildCentralCredMap();
    expect(map).toMatchObject({ httpHeaderAuth: 'wtok-42', smtp: 'smtp-1' });
  });

  it('is omitted from buildCentralCredMap when unset', () => {
    const map = buildCentralCredMap();
    expect(map).not.toHaveProperty('httpHeaderAuth');
  });
});
