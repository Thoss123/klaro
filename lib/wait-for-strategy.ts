import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

/** Pollt projects.strategy bis vorhanden oder Timeout — fail-open (true = ready oder übersprungen). */
export async function waitForProjectStrategy(
  projectId: string,
  maxWaitMs = 55_000,
  intervalMs = 1_500,
): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const { data } = await supabase
      .from('projects')
      .select('strategy')
      .eq('id', projectId)
      .maybeSingle();
    if (data?.strategy?.trim()) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}
