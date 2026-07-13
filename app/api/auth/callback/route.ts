import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getRequestOrigin } from '@/lib/app-origin'
import { AUTH_ALLOWLIST_MESSAGE, isEmailAllowedForAuth } from '@/lib/auth-allowlist'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const origin = getRequestOrigin(request)
  const code = searchParams.get('code')
  const requestedNext = searchParams.get('next') ?? '/chat'
  // Never send an authenticated user back to an auth page — that would loop
  // straight back into the login form. Fall back to the dashboard instead.
  const next = requestedNext === '/login' ? '/dashboard' : requestedNext

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!isEmailAllowedForAuth(user?.email)) {
        await supabase.auth.signOut()
        const deniedPath = next.startsWith('/bernd') ? '/bernd/login' : '/login'
        return NextResponse.redirect(
          `${origin}${deniedPath}?${new URLSearchParams({ auth: 'denied', message: AUTH_ALLOWLIST_MESSAGE }).toString()}`,
        )
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth`)
}
