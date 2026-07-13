import { afterEach, describe, expect, it } from 'vitest';
import { getAuthAllowedEmails, isAuthAllowlistEnforced, isEmailAllowedForAuth } from '@/lib/auth-allowlist';

const original = process.env.AUTH_ALLOWED_EMAILS;

afterEach(() => {
  process.env.AUTH_ALLOWED_EMAILS = original;
});

describe('auth allowlist', () => {
  it('allows every email when AUTH_ALLOWED_EMAILS is unset', () => {
    delete process.env.AUTH_ALLOWED_EMAILS;

    expect(isAuthAllowlistEnforced()).toBe(false);
    expect(isEmailAllowedForAuth('kunde@example.com')).toBe(true);
  });

  it('normalizes configured emails', () => {
    process.env.AUTH_ALLOWED_EMAILS = ' Test@Example.com, zweite@example.com ';

    expect(getAuthAllowedEmails()).toEqual(['test@example.com', 'zweite@example.com']);
    expect(isAuthAllowlistEnforced()).toBe(true);
    expect(isEmailAllowedForAuth('test@example.com')).toBe(true);
    expect(isEmailAllowedForAuth('TEST@example.com')).toBe(true);
    expect(isEmailAllowedForAuth('fremd@example.com')).toBe(false);
  });
});
