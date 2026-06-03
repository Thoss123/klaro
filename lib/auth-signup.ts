import type { AuthError, SignUpResponse } from '@supabase/supabase-js'

/** True when sign-up was attempted for an email that already has an account. */
export function isExistingAccountOnSignup(
  data: SignUpResponse['data'],
  error: AuthError | null,
): boolean {
  if (error) {
    const msg = error.message.toLowerCase()
    const code = (error.code ?? '').toLowerCase()
    return (
      code === 'user_already_exists' ||
      code === 'email_exists' ||
      msg.includes('already registered') ||
      msg.includes('already been registered') ||
      msg.includes('user already exists')
    )
  }
  if (data?.user && (!data.user.identities || data.user.identities.length === 0)) {
    return true
  }
  return false
}
