import { describe, expect, it } from 'vitest';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

describe('waitlist email validation', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('test@makler.at')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});
