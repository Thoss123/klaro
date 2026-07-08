import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getAdminUser } from '@/lib/admin-auth';

describe('getAdminUser production lock', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAdminEmails = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    vi.stubEnv('ADMIN_EMAILS', '');
  });

  afterEach(() => {
    vi.stubEnv('NODE_ENV', originalNodeEnv ?? 'test');
    if (originalAdminEmails === undefined) {
      delete process.env.ADMIN_EMAILS;
    } else {
      vi.stubEnv('ADMIN_EMAILS', originalAdminEmails);
    }
  });

  it('denies admin in production when ADMIN_EMAILS is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'u1', email: 'user@test.com' } } }),
      },
    } as Parameters<typeof getAdminUser>[0];
    const result = await getAdminUser(supabase);
    expect(result).toBeNull();
  });

  it('allows any authenticated user in development when ADMIN_EMAILS is unset', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const user = { id: 'u1', email: 'dev@test.com' };
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user } }),
      },
    } as Parameters<typeof getAdminUser>[0];
    const result = await getAdminUser(supabase);
    expect(result).toEqual(user);
  });

  it('allows only listed emails when ADMIN_EMAILS is set', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_EMAILS', 'admin@test.com');
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'u1', email: 'admin@test.com' } } }),
      },
    } as Parameters<typeof getAdminUser>[0];
    expect(await getAdminUser(supabase)).toEqual({ id: 'u1', email: 'admin@test.com' });
  });
});
