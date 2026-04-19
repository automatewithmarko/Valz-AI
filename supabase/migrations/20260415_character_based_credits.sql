-- ─────────────────────────────────────────────────────────────────────
-- Character-based credit system
--
-- 1 credit = 1,000 characters of chat content (user input + AI output).
-- Our AI cost (grok-3-fast, blended): ~$2.50 per 1M characters
--  → $0.0025 per credit at cost.
--
-- Plan allocation (25% of revenue → AI cost, ~75% gross margin):
--   Starter $15 → 1,500 credits  (~$3.75 AI cost, 1.5M chars)
--   Growth  $25 → 2,500 credits  (~$6.25 AI cost, 2.5M chars)
--   Pro     $35 → 3,500 credits  (~$8.75 AI cost, 3.5M chars)
-- ─────────────────────────────────────────────────────────────────────

-- Reseed plan data
UPDATE public.plans
SET
  monthly_credits = 1500,
  conversation_limit = NULL,
  brand_dna_profile_limit = 1,
  features = '[
    "1,500 AI credits per month (~1.5M characters)",
    "Personalized, context-aware brand analysis",
    "1 Brand DNA profile",
    "Email support"
  ]'::jsonb
WHERE name = 'starter';

UPDATE public.plans
SET
  monthly_credits = 2500,
  conversation_limit = NULL,
  brand_dna_profile_limit = 3,
  features = '[
    "2,500 AI credits per month (~2.5M characters)",
    "Longer, more detailed responses",
    "Voice-to-text input for hands-free use",
    "3 Brand DNA profiles",
    "Priority support"
  ]'::jsonb
WHERE name = 'growth';

UPDATE public.plans
SET
  monthly_credits = 3500,
  conversation_limit = NULL,
  brand_dna_profile_limit = NULL,
  features = '[
    "3,500 AI credits per month (~3.5M characters)",
    "Fastest response times",
    "Unlimited Brand DNA profiles",
    "Manage multiple brands in one account",
    "Dedicated priority support"
  ]'::jsonb
WHERE name = 'pro';

-- ─────────────────────────────────────────────────────────────────────
-- RPC: deduct_credits
-- Atomically deducts `credit_amount` from a user's balance and records
-- a credit_transactions row. Returns the new balance. Returns -1 if
-- the user has no credits row or insufficient balance (caller should
-- pre-check, but we guard against negative balances).
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.deduct_credits(
  user_uuid uuid,
  credit_amount integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance integer;
  new_balance integer;
BEGIN
  IF credit_amount <= 0 THEN
    RETURN (SELECT balance FROM public.credits WHERE user_id = user_uuid);
  END IF;

  SELECT balance INTO current_balance
  FROM public.credits
  WHERE user_id = user_uuid
  FOR UPDATE;

  IF current_balance IS NULL THEN
    RETURN -1;
  END IF;

  new_balance := GREATEST(current_balance - credit_amount, 0);

  UPDATE public.credits
  SET
    balance = new_balance,
    lifetime_used = lifetime_used + (current_balance - new_balance),
    updated_at = now()
  WHERE user_id = user_uuid;

  INSERT INTO public.credit_transactions (
    user_id, amount, balance_after, type, description
  )
  VALUES (
    user_uuid,
    -(current_balance - new_balance),
    new_balance,
    'usage',
    'AI chat usage'
  );

  RETURN new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer) TO authenticated;
