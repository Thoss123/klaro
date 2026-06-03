import { describe, it, expect } from 'vitest'
import { isExistingAccountOnSignup } from '@/lib/auth-signup'

describe('isExistingAccountOnSignup', () => {
  it('detects Supabase error for existing user', () => {
    expect(
      isExistingAccountOnSignup(null, {
        message: 'User already registered',
        name: 'AuthApiError',
        status: 400,
      } as never),
    ).toBe(true)
  })

  it('detects empty identities on sign-up response', () => {
    expect(
      isExistingAccountOnSignup(
        { user: { id: 'u1', identities: [] } } as never,
        null,
      ),
    ).toBe(true)
  })

  it('returns false for new user sign-up', () => {
    expect(
      isExistingAccountOnSignup(
        { user: { id: 'u1', identities: [{ id: 'i1' }] } } as never,
        null,
      ),
    ).toBe(false)
  })
})
