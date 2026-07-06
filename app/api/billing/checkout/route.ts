import { NextRequest, NextResponse } from 'next/server';
import { TEST_TOPUP_CREDITS } from '@/lib/billing/credit-constants';
import { ensureUserBilling } from '@/lib/billing/credits';
import { getStripeClient, getStripeTestTopupPriceId } from '@/lib/billing/stripe';
import { getRequestOrigin } from '@/lib/app-origin';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createSupabaseServiceClient } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  const supabaseAuth = await createSupabaseServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const billing = await ensureUserBilling(user.id, supabase);
  const stripe = getStripeClient();

  let customerId = billing.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    await supabase
      .from('user_billing')
      .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
  }

  const origin = getRequestOrigin(request);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    client_reference_id: user.id,
    line_items: [
      {
        price: getStripeTestTopupPriceId(),
        quantity: 1,
      },
    ],
    success_url: `${origin}/chat?billing=topup_success`,
    cancel_url: `${origin}/chat?billing=topup_cancelled`,
    metadata: {
      user_id: user.id,
      credits: String(TEST_TOPUP_CREDITS),
      kind: 'test_topup',
    },
  });

  return NextResponse.json({ url: session.url });
}

