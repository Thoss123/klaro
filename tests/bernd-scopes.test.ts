/**
 * Tests für lib/bernd/scopes.ts — die feste Zuordnung Setup-Chat-Scope-ID → golden
 * Template-Slug (SCOPE_TO_SLUG). Der wichtigste Vertrag hier: jeder Slug, den
 * SCOPE_TO_SLUG referenziert, MUSS im Template-Manifest (lib/bernd/templates.ts,
 * BERND_TEMPLATES) tatsächlich existieren — sonst deployt app/api/bernd/deploy/route.ts
 * einen Scope, für den buildScalarsForSlug() beim Manifest-Lookup `undefined` bekommt
 * (getTemplateManifest gibt dann silently ein leeres Skalar-Schema zurück, statt zu werfen).
 */
import { describe, expect, it } from 'vitest';
import { SCOPE_TO_SLUG, SETUP_SCOPE_IDS, SCOPE_LABELS, slugForScope } from '@/lib/bernd/scopes';
import { getTemplateManifest, BERND_TEMPLATES } from '@/lib/bernd/templates';

describe('SCOPE_TO_SLUG', () => {
  it('every referenced slug exists in the BERND_TEMPLATES manifest', () => {
    for (const [scopeId, slug] of Object.entries(SCOPE_TO_SLUG)) {
      const entry = getTemplateManifest(slug);
      expect(entry, `scope "${scopeId}" points at unknown slug "${slug}"`).toBeDefined();
    }
  });

  it('has no duplicate slugs across different scope ids', () => {
    const slugs = Object.values(SCOPE_TO_SLUG);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('covers the four fixed handwerker scopes named in the setup-prompt (§Tag-Set)', () => {
    expect(Object.keys(SCOPE_TO_SLUG).sort()).toEqual(['angebot', 'email_triage', 'followup', 'rechnung'].sort());
  });
});

describe('SETUP_SCOPE_IDS', () => {
  it('matches the keys of SCOPE_TO_SLUG exactly, in the same order', () => {
    expect(SETUP_SCOPE_IDS).toEqual(Object.keys(SCOPE_TO_SLUG));
  });
});

describe('SCOPE_LABELS', () => {
  it('has a label for every known scope id', () => {
    for (const id of SETUP_SCOPE_IDS) {
      expect(SCOPE_LABELS[id], `missing label for scope "${id}"`).toBeTruthy();
    }
  });
});

describe('slugForScope', () => {
  it('resolves every known scope id to its golden slug', () => {
    for (const [scopeId, slug] of Object.entries(SCOPE_TO_SLUG)) {
      expect(slugForScope(scopeId)).toBe(slug);
    }
  });

  it('returns null for an unknown scope id', () => {
    expect(slugForScope('nicht_existent')).toBeNull();
    expect(slugForScope('')).toBeNull();
  });
});

describe('email_triage scope → email-triage-draft manifest', () => {
  it('resolves to the golden flow that only requires gmail (Telegram-HITL, not WhatsApp)', () => {
    const slug = slugForScope('email_triage');
    expect(slug).toBe('email-triage-draft');
    const manifest = BERND_TEMPLATES.find((t) => t.slug === slug);
    expect(manifest?.requiredTools).toEqual(['gmail']);
  });
});
