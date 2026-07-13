/**
 * Tests für die reine Bau-Logik hinter "Bernd einstellen" (app/api/bernd/deploy/route.ts):
 * buildScalarsForSlug() aus lib/bernd/provision.ts (Skalare pro golden Template) und die
 * Scope→Slug-Auflösung aus lib/bernd/scopes.ts. deployTemplateWorkflow()/die Route selbst
 * werden bewusst NICHT aufgerufen (echter n8n-/Supabase-Call) — nur die exportierten,
 * reinen Helfer, wie in der Aufgabenstellung gefordert.
 */
import { describe, expect, it } from 'vitest';
import { buildScalarsForSlug } from '@/lib/bernd/provision';
import { projectSuffix } from '@/lib/template-deploy';
import { slugForScope } from '@/lib/bernd/scopes';
import type { SetupScope } from '@/lib/bernd/types';

const PROJECT_ID = 'a1b2c3d4-e5f6-4711-8899-aabbccddeeff';

describe('buildScalarsForSlug — email-triage-draft', () => {
  const args = {
    slug: 'email-triage-draft',
    gewerk: 'Elektriker',
    personaFile: 'rules/persona_elektriker.md',
    appBaseUrl: 'https://www.axantilo.com',
    projectId: PROJECT_ID,
  };

  it('fills every common scalar the loader needs', () => {
    const scalars = buildScalarsForSlug(args);
    expect(scalars.APP_BASE_URL).toBe('https://www.axantilo.com');
    expect(scalars.PROJECT_ID).toBe(PROJECT_ID);
    expect(scalars.PERSONA_PATH).toBe('rules/persona_elektriker.md');
    expect(scalars.GEWERK).toBe('Elektriker');
    expect(scalars.STUNDENSATZ).toBe('0');
    expect(scalars.MATERIALAUFSCHLAG).toBe('0');
    expect(scalars.ANFAHRTSPAUSCHALE).toBe('0');
  });

  it('generates a unique-per-project EMAIL_SEND_WEBHOOK_PATH, since the manifest declares it', () => {
    const scalars = buildScalarsForSlug(args);
    const suffix = projectSuffix(PROJECT_ID);
    expect(scalars.EMAIL_SEND_WEBHOOK_PATH).toBe(`email-send-${suffix}`);
    // findSendWebhookPath in telegram-dispatch.ts relies on this exact naming convention.
    expect(scalars.EMAIL_SEND_WEBHOOK_PATH.toUpperCase()).toContain('SEND');
  });

  it('does not invent scalars the manifest does not declare for this slug', () => {
    const scalars = buildScalarsForSlug(args);
    expect(scalars.PREISLISTE_TABLE).toBeUndefined();
    expect(scalars.INVOICE_TABLE).toBeUndefined();
    expect(scalars.ORDER_DONE_WEBHOOK_PATH).toBeUndefined();
  });

  it('lets explicit overrides win against the generic defaults', () => {
    const scalars = buildScalarsForSlug({ ...args, overrides: { STUNDENSATZ: '95', GEWERK: 'Custom' } });
    expect(scalars.STUNDENSATZ).toBe('95');
    expect(scalars.GEWERK).toBe('Custom');
  });
});

describe('buildScalarsForSlug — rechnung-mahnwesen', () => {
  it('fills the invoice-specific scalars declared in its manifest', () => {
    const scalars = buildScalarsForSlug({
      slug: 'rechnung-mahnwesen',
      gewerk: 'SHK',
      personaFile: 'rules/persona_shk.md',
      appBaseUrl: 'https://www.axantilo.com',
      projectId: PROJECT_ID,
    });
    expect(scalars.INVOICE_TABLE).toBe('rechnungen');
    expect(scalars.INVOICE_DOC_TEMPLATE_ID).toBe('');
    expect(scalars.ORDER_DONE_WEBHOOK_PATH).toBe(`auftrag-fertig-${projectSuffix(PROJECT_ID)}`);
    // angebot-autopilot-only scalars must stay absent here.
    expect(scalars.OFFER_APPROVAL_WEBHOOK_PATH).toBeUndefined();
  });
});

describe('buildScalarsForSlug — angebot-autopilot', () => {
  it('fills the offer-approval webhook path and the WhatsApp scalars its manifest declares', () => {
    const scalars = buildScalarsForSlug({
      slug: 'angebot-autopilot',
      gewerk: 'Maler',
      personaFile: 'rules/persona_maler.md',
      appBaseUrl: 'https://www.axantilo.com',
      projectId: PROJECT_ID,
    });
    expect(scalars.OFFER_APPROVAL_WEBHOOK_PATH).toBe(`angebot-freigabe-${projectSuffix(PROJECT_ID)}`);
    expect(scalars.PREISLISTE_TABLE).toBe('preisliste');
    expect(scalars.FOLLOWUP_TABLE).toBe('followup_leads');
    expect(scalars.TWILIO_WHATSAPP_FROM).toBeTruthy();
  });
});

describe('buildScalarsForSlug — unknown slug', () => {
  it('still fills common scalars but adds no schema-driven extras', () => {
    const scalars = buildScalarsForSlug({
      slug: 'nicht-existent',
      gewerk: 'Tischler',
      personaFile: 'rules/persona_tischler.md',
      appBaseUrl: 'https://www.axantilo.com',
      projectId: PROJECT_ID,
    });
    expect(scalars.APP_BASE_URL).toBe('https://www.axantilo.com');
    expect(scalars.EMAIL_SEND_WEBHOOK_PATH).toBeUndefined();
    expect(scalars.OFFER_APPROVAL_WEBHOOK_PATH).toBeUndefined();
  });
});

/**
 * Repliziert exakt das Filter+Map-Muster aus app/api/bernd/deploy/route.ts (gewählte Scopes →
 * golden Slugs), ohne die Route selbst (HTTP/Supabase/n8n) aufzurufen — nur die Vertrags-
 * Konsistenz zwischen setup_state.scopes und lib/bernd/scopes.ts#slugForScope.
 */
function resolveDeployableSlugs(scopes: SetupScope[]): string[] {
  return scopes
    .filter((scope) => scope.status === 'gewaehlt')
    .map((scope) => slugForScope(scope.id))
    .filter((slug): slug is string => slug !== null);
}

describe('gewählte Scopes → golden Slugs (deploy/route.ts Muster)', () => {
  it('only resolves scopes with status "gewaehlt", ignoring vorgeschlagen/abgelehnt', () => {
    const scopes: SetupScope[] = [
      { id: 'email_triage', status: 'gewaehlt' },
      { id: 'angebot', status: 'vorgeschlagen' },
      { id: 'rechnung', status: 'abgelehnt' },
      { id: 'followup', status: 'gewaehlt' },
    ];
    expect(resolveDeployableSlugs(scopes)).toEqual(['email-triage-draft', 'followup-serie']);
  });

  it('returns an empty list when nothing is gewaehlt', () => {
    expect(resolveDeployableSlugs([])).toEqual([]);
    expect(resolveDeployableSlugs([{ id: 'email_triage', status: 'vorgeschlagen' }])).toEqual([]);
  });
});
