import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function requirePublicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them in Vercel → Settings → Environment Variables.',
    )
  }
  return { url, anonKey }
}

/** Server routes: service role key required in production. Created lazily — safe at build time. */
export function createSupabaseServiceClient(): SupabaseClient {
  const { url } = requirePublicSupabaseEnv()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!serviceKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY is required in production. Set it in Vercel → Environment Variables.',
      )
    }
    console.warn(
      '[supabase] SUPABASE_SERVICE_ROLE_KEY missing — falling back to anon key (dev only).',
    )
  }
  const key = serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim()
  return createClient(url, key)
}

/** Server routes that only need the public anon key. */
export function createSupabaseAnonClient(): SupabaseClient {
  const { url, anonKey } = requirePublicSupabaseEnv()
  return createClient(url, anonKey)
}
