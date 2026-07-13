import type { MailProvider } from '@/lib/template-loader';
import type { BerndSetupState } from '@/lib/bernd/types';

export interface BerndMailConnection {
  provider: 'google' | 'microsoft';
  toolName: 'gmail' | 'outlook';
  credentialType: 'gmailOAuth2' | 'microsoftOutlookOAuth2Api';
  accountLabel: 'Gmail' | 'Outlook';
}

export const BERND_MAIL_CONNECTIONS: Record<'gmail' | 'outlook', BerndMailConnection> = {
  gmail: {
    provider: 'google',
    toolName: 'gmail',
    credentialType: 'gmailOAuth2',
    accountLabel: 'Gmail',
  },
  outlook: {
    provider: 'microsoft',
    toolName: 'outlook',
    credentialType: 'microsoftOutlookOAuth2Api',
    accountLabel: 'Outlook',
  },
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function detectBerndMailProvider(
  tools: Record<string, unknown> | null | undefined,
  setupState?: BerndSetupState | null,
): MailProvider | null {
  const setupValue = setupState?.ablauf?.email_triage?.mail_provider?.trim().toLowerCase();
  if (setupValue?.includes('outlook') || setupValue?.includes('microsoft')) return 'outlook';
  if (setupValue?.includes('gmail') || setupValue?.includes('google')) return 'gmail';
  if (setupValue?.includes('imap')) return 'imap';

  const explicit = typeof tools?.mail_provider === 'string' ? tools.mail_provider.toLowerCase() : '';
  if (explicit === 'outlook' || explicit === 'imap' || explicit === 'gmail') return explicit;

  const used = stringArray(tools?.genutzt).map((item) => item.toLowerCase());
  if (used.includes('outlook')) return 'outlook';
  if (used.includes('gmail')) return 'gmail';
  return null;
}

export function resolveBerndMailProvider(
  tools: Record<string, unknown> | null | undefined,
  setupState?: BerndSetupState | null,
): MailProvider {
  return detectBerndMailProvider(tools, setupState) ?? 'gmail';
}

export function mailToolName(provider: MailProvider): string {
  return provider === 'outlook' ? 'outlook' : provider === 'imap' ? 'imap' : 'gmail';
}
