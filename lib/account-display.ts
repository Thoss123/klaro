import type { OnboardingData } from '@/lib/types'
import type { User } from '@supabase/supabase-js'

export type AccountDisplayInfo = {
  displayName: string
  email: string
  subtitle: string
  initial: string
}

function pickInitial(label: string): string {
  const t = label.trim()
  if (!t) return '?'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  }
  return t[0].toUpperCase()
}

/** Name, E-Mail und Kurzinfo für Sidebar / Account-UI aus Auth + Onboarding. */
export function getAccountDisplayInfo(
  user: User,
  onboarding?: OnboardingData | null,
): AccountDisplayInfo {
  const email = user.email?.trim() ?? ''
  const meta = user.user_metadata as Record<string, unknown> | undefined
  const oauthName =
    (typeof meta?.full_name === 'string' && meta.full_name) ||
    (typeof meta?.name === 'string' && meta.name) ||
    ''
  const vorname = (onboarding?.vorname || onboarding?.username || '').trim()
  const firmenname = onboarding?.firmenname?.trim() ?? ''

  const displayName =
    oauthName ||
    (vorname && vorname !== 'Nutzer' ? vorname : '') ||
    (email ? email.split('@')[0] : 'Account')

  const subtitle = firmenname || 'Klaro Account'

  return {
    displayName,
    email,
    subtitle,
    initial: pickInitial(displayName || email),
  }
}
