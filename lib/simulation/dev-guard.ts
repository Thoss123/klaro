import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getAdminUser } from '@/lib/admin-auth';

/** Dev-only simulation routes; in production requires ENABLE_SIM_DEV + admin. */
export async function devSimGuard(): Promise<NextResponse | null> {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_SIM_DEV !== 'true') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_SIM_DEV === 'true') {
    const supabase = await createSupabaseServerClient();
    const admin = await getAdminUser(supabase);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}
