import { TEST_STARTING_CREDITS } from '@/lib/billing/credit-constants';
import {
  computeProviderCostEur,
  normalizeTokenUsage,
  usageToCredits,
  type TokenUsage,
} from '@/lib/billing/token-cost';
import { createSupabaseServiceClient } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

export type BillingContext = {
  userId: string;
  creditsBalance: number;
  creditsLifetimeGranted: number;
  stripeCustomerId: string | null;
};

export type CreditMutationResult = {
  creditsBalance: number;
  ledgerId: string | null;
};

export type CanAffordResult = {
  ok: boolean;
  balance: number;
  required: number;
};

export type DebitFromUsageInput = {
  userId: string;
  usage: TokenUsage;
  model: string;
  action: string;
  projectId?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown>;
};

export type GrantCreditsInput = {
  userId: string;
  credits: number;
  action?: string;
  stripeEventId?: string | null;
  metadata?: Record<string, unknown>;
};

type BillingRow = {
  user_id?: unknown;
  credits_balance?: unknown;
  credits_lifetime_granted?: unknown;
  stripe_customer_id?: unknown;
};

type RpcCreditRow = {
  credits_balance?: unknown;
  ledger_id?: unknown;
};

function billingDisabled(): boolean {
  return process.env.BILLING_DISABLED === 'true';
}

function asInteger(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asBillingContext(userId: string, row: BillingRow | null): BillingContext {
  return {
    userId,
    creditsBalance: asInteger(row?.credits_balance, TEST_STARTING_CREDITS),
    creditsLifetimeGranted: asInteger(row?.credits_lifetime_granted, TEST_STARTING_CREDITS),
    stripeCustomerId: asString(row?.stripe_customer_id),
  };
}

function firstRpcRow(data: unknown): RpcCreditRow | null {
  if (Array.isArray(data)) {
    const first = data[0];
    return typeof first === 'object' && first !== null ? first as RpcCreditRow : null;
  }
  return typeof data === 'object' && data !== null ? data as RpcCreditRow : null;
}

function asMutationResult(data: unknown): CreditMutationResult {
  const row = firstRpcRow(data);
  return {
    creditsBalance: asInteger(row?.credits_balance),
    ledgerId: asString(row?.ledger_id),
  };
}

function getClient(client?: SupabaseClient): SupabaseClient {
  return client ?? createSupabaseServiceClient();
}

export function buildDebitRpcParams(input: DebitFromUsageInput, credits: number, apiCostEur: number) {
  const normalized = normalizeTokenUsage(input.usage);
  return {
    p_user_id: input.userId,
    p_credits: credits,
    p_action: input.action,
    p_project_id: input.projectId ?? null,
    p_session_id: input.sessionId ?? null,
    p_api_cost_eur: Number(apiCostEur.toFixed(6)),
    p_input_tokens: normalized.inputTokens,
    p_output_tokens: normalized.outputTokens,
    p_model: input.model,
    p_metadata: input.metadata ?? {},
  };
}

export async function ensureUserBilling(
  userId: string,
  client?: SupabaseClient,
): Promise<BillingContext> {
  if (billingDisabled()) {
    return {
      userId,
      creditsBalance: Number.MAX_SAFE_INTEGER,
      creditsLifetimeGranted: Number.MAX_SAFE_INTEGER,
      stripeCustomerId: null,
    };
  }

  const supabase = getClient(client);
  const { error: upsertError } = await supabase
    .from('user_billing')
    .upsert(
      { user_id: userId },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );

  if (upsertError) {
    throw new Error(`Billing konnte nicht initialisiert werden: ${upsertError.message}`);
  }

  return getBillingContext(userId, supabase);
}

export async function getBillingContext(
  userId: string,
  client?: SupabaseClient,
): Promise<BillingContext> {
  const supabase = getClient(client);
  const { data, error } = await supabase
    .from('user_billing')
    .select('user_id, credits_balance, credits_lifetime_granted, stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Billing konnte nicht gelesen werden: ${error.message}`);
  }

  if (!data) {
    return ensureUserBilling(userId, supabase);
  }

  return asBillingContext(userId, data as BillingRow);
}

export async function getCreditsBalance(
  userId: string,
  client?: SupabaseClient,
): Promise<number> {
  const billing = await getBillingContext(userId, client);
  return billing.creditsBalance;
}

export async function canAfford(
  userId: string,
  requiredCredits: number,
  client?: SupabaseClient,
): Promise<CanAffordResult> {
  if (billingDisabled()) {
    return { ok: true, balance: Number.MAX_SAFE_INTEGER, required: requiredCredits };
  }

  const balance = await getCreditsBalance(userId, client);
  return {
    ok: balance >= requiredCredits,
    balance,
    required: requiredCredits,
  };
}

export async function debitFromUsage(
  input: DebitFromUsageInput,
  client?: SupabaseClient,
): Promise<CreditMutationResult & { credits: number; apiCostEur: number }> {
  const apiCostEur = computeProviderCostEur(input.usage, input.model);
  const credits = usageToCredits(input.usage, input.model);

  if (billingDisabled() || credits === 0) {
    return {
      credits,
      apiCostEur,
      creditsBalance: billingDisabled() ? Number.MAX_SAFE_INTEGER : await getCreditsBalance(input.userId, client),
      ledgerId: null,
    };
  }

  const supabase = getClient(client);
  const { data, error } = await supabase.rpc(
    'debit_user_credits',
    buildDebitRpcParams(input, credits, apiCostEur),
  );

  if (error) {
    throw new Error(`Credits konnten nicht abgebucht werden: ${error.message}`);
  }

  return {
    credits,
    apiCostEur,
    ...asMutationResult(data),
  };
}

export async function grantCredits(
  input: GrantCreditsInput,
  client?: SupabaseClient,
): Promise<CreditMutationResult> {
  if (!Number.isInteger(input.credits) || input.credits <= 0) {
    throw new Error('Credit-Gutschrift muss eine positive Ganzzahl sein');
  }

  if (billingDisabled()) {
    return { creditsBalance: Number.MAX_SAFE_INTEGER, ledgerId: null };
  }

  const supabase = getClient(client);
  const { data, error } = await supabase.rpc('grant_user_credits', {
    p_user_id: input.userId,
    p_credits: input.credits,
    p_action: input.action ?? 'grant',
    p_stripe_event_id: input.stripeEventId ?? null,
    p_metadata: input.metadata ?? {},
  });

  if (error) {
    throw new Error(`Credits konnten nicht gutgeschrieben werden: ${error.message}`);
  }

  return asMutationResult(data);
}

