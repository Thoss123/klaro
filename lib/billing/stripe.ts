import Stripe from 'stripe';

export const STRIPE_API_VERSION = '2026-06-24.dahlia';

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is missing');
  }

  stripeClient ??= new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
  });

  return stripeClient;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is missing');
  }
  return secret;
}

export function getStripeTestTopupPriceId(): string {
  const priceId = process.env.STRIPE_PRICE_TEST_TOPUP?.trim();
  if (!priceId) {
    throw new Error('STRIPE_PRICE_TEST_TOPUP is missing');
  }
  return priceId;
}

