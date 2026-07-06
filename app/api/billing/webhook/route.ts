import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { TEST_TOPUP_CREDITS } from '@/lib/billing/credit-constants';
import { grantCredits } from '@/lib/billing/credits';
import { getStripeClient, getStripeWebhookSecret } from '@/lib/billing/stripe';
import { createSupabaseServiceClient } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  const stripe = getStripeClient();
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = stripe.webhooks.constructEvent(body, signature, getStripeWebhookSecret());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Invalid Stripe webhook: ${message}` }, { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.kind !== 'test_topup') {
    return NextResponse.json({ received: true });
  }

  const userId = session.metadata?.user_id || session.client_reference_id;
  if (!userId) {
    return NextResponse.json({ error: 'Missing user_id metadata' }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data: existing } = await supabase
    .from('credit_ledger')
    .select('id')
    .eq('stripe_event_id', event.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (customerId) {
    await supabase
      .from('user_billing')
      .upsert(
        {
          user_id: userId,
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
  }

  try {
    await grantCredits(
      {
        userId,
        credits: TEST_TOPUP_CREDITS,
        action: 'stripe_test_topup',
        stripeEventId: event.id,
        metadata: {
          checkout_session_id: session.id,
          customer_id: customerId ?? null,
          payment_status: session.payment_status,
        },
      },
      supabase,
    );
  } catch (error: unknown) {
    const maybeDuplicate =
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      String((error as { message?: unknown }).message).includes('duplicate');

    if (!maybeDuplicate) {
      throw error;
    }
  }

  return NextResponse.json({ received: true });
}

