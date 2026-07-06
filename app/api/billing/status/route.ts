import { NextResponse } from 'next/server';
import { TEST_TOPUP_CREDITS, TEST_TOPUP_PRICE_EUR } from '@/lib/billing/credit-constants';
import { ensureUserBilling } from '@/lib/billing/credits';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createSupabaseServiceClient } from '@/lib/supabase';

export async function GET() {
  const supabaseAuth = await createSupabaseServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const billing = await ensureUserBilling(user.id, supabase);
  const { data: lastDebits } = await supabase
    .from('credit_ledger')
    .select('action, credits, balance_after, api_cost_eur, input_tokens, output_tokens, model, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  return NextResponse.json({
    balance: billing.creditsBalance,
    lifetimeGranted: billing.creditsLifetimeGranted,
    topup: {
      priceEur: TEST_TOPUP_PRICE_EUR,
      credits: TEST_TOPUP_CREDITS,
    },
    lastDebits: lastDebits ?? [],
  });
}

