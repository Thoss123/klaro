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

/** Server routes: anon key (or service role when provided). Created lazily — safe at build time. */
export function createSupabaseServiceClient(): SupabaseClient {
  const { url } = requirePublicSupabaseEnv()
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim()
  return createClient(url, key)
}

/** Server routes that only need the public anon key. */
export function createSupabaseAnonClient(): SupabaseClient {
  const { url, anonKey } = requirePublicSupabaseEnv()
  return createClient(url, anonKey)
}
