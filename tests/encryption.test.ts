import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, mask } from '@/lib/encryption';

describe('encryption', () => {
  it('round-trips a plaintext value', () => {
    const secret = 'sk-live-abcdef123456';
    const enc = encrypt(secret);
    expect(enc).not.toContain(secret);
    expect(enc.split(':')).toHaveLength(3);
    expect(decrypt(enc)).toBe(secret);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });

  it('round-trips unicode + empty string', () => {
    expect(decrypt(encrypt(''))).toBe('');
    expect(decrypt(encrypt('äöü 🔑 €'))).toBe('äöü 🔑 €');
  });

  it('rejects malformed ciphertext', () => {
    expect(() => decrypt('not-valid')).toThrow('Invalid ciphertext format');
  });

  it('fails to decrypt when the auth tag is tampered', () => {
    const [iv, , ct] = encrypt('secret').split(':');
    expect(() => decrypt(`${iv}:${'0'.repeat(32)}:${ct}`)).toThrow();
  });

  it('masks values, hiding all but the last 4 chars', () => {
    expect(mask('sk-1234abcd')).toBe('••••abcd');
    expect(mask('abc')).toBe('••••');
  });
});
