import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getAdminUser } from '@/lib/admin-auth';
import KnowledgeAdminClient from './KnowledgeAdminClient';

// Always evaluate the auth guard on the server per request.
export const dynamic = 'force-dynamic';

export default async function KnowledgeAdminPage() {
  const supabase = await createSupabaseServerClient();
  const admin = await getAdminUser(supabase);
  if (!admin) redirect('/login');
  return <KnowledgeAdminClient />;
}
