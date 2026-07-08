import { describe, expect, it } from 'vitest';
import { checkRateLimit } from '@/lib/rate-limit';

describe('checkRateLimit', () => {
  it('allows requests under the limit', () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    expect(checkRateLimit(key, 3, 60_000)).toEqual({ ok: true });
    expect(checkRateLimit(key, 3, 60_000)).toEqual({ ok: true });
    expect(checkRateLimit(key, 3, 60_000)).toEqual({ ok: true });
  });

  it('blocks when limit exceeded', () => {
    const key = `test-block-${Date.now()}-${Math.random()}`;
    checkRateLimit(key, 2, 60_000);
    checkRateLimit(key, 2, 60_000);
    const blocked = checkRateLimit(key, 2, 60_000);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
    }
  });
});
