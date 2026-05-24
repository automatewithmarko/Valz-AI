-- ─────────────────────────────────────────────────────────────────────
-- Fractional credit accounting
--
-- Credit deductions are now fractional (no Math.ceil, no 1-credit
-- minimum floor on the application side). To support sub-credit
-- balances, the integer columns become numeric. Plan grants stay
-- whole numbers, but balances and per-turn deductions can be partial.
--
-- Also: chars-per-credit was changed from 1,000 → 1,600 in the app.
-- Updating the plan features text so the on-screen character estimate
-- matches the new ratio:
--   Starter 1,500 cr → ~2.4M characters
--   Growth  2,500 cr → ~4.0M characters
--   Pro     3,500 cr → ~5.6M characters
--
-- Existing integer balances cast cleanly into numeric — no data loss.
-- ─────────────────────────────────────────────────────────────────────

-- 1. Widen balance + transaction columns to numeric(12,4)
ALTER TABLE public.credits
  ALTER COLUMN balance TYPE numeric(12,4) USING balance::numeric,
  ALTER COLUMN lifetime_used TYPE numeric(12,4) USING lifetime_used::numeric;

ALTER TABLE public.credit_transactions
  ALTER COLUMN amount TYPE numeric(12,4) USING amount::numeric,
  ALTER COLUMN balance_after TYPE numeric(12,4) USING balance_after::numeric;

-- 2. Redefine deduct_credits to accept + return numeric.
-- The old integer signature must be dropped first because the param
-- type is changing.
DROP FUNCTION IF EXISTS public.deduct_credits(uuid, integer);

CREATE OR REPLACE FUNCTION public.deduct_credits(
  user_uuid uuid,
  credit_amount numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance numeric;
  new_balance numeric;
  actual_deduction numeric;
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
  actual_deduction := current_balance - new_balance;

  UPDATE public.credits
  SET
    balance = new_balance,
    lifetime_used = lifetime_used + actual_deduction,
    updated_at = now()
  WHERE user_id = user_uuid;

  INSERT INTO public.credit_transactions (
    user_id, amount, balance_after, type, description
  )
  VALUES (
    user_uuid,
    -actual_deduction,
    new_balance,
    'usage',
    'AI chat usage'
  );

  RETURN new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, numeric) TO authenticated;

-- 3. Refresh plan features text to reflect 1,600 chars/credit.
UPDATE public.plans
SET features = '[
  "1,500 AI credits per month (~2.4M characters)",
  "Personalized, context-aware brand analysis",
  "1 Brand DNA profile",
  "Email support"
]'::jsonb
WHERE name = 'starter';

UPDATE public.plans
SET features = '[
  "2,500 AI credits per month (~4.0M characters)",
  "Longer, more detailed responses",
  "Voice-to-text input for hands-free use",
  "3 Brand DNA profiles",
  "Priority support"
]'::jsonb
WHERE name = 'growth';

UPDATE public.plans
SET features = '[
  "3,500 AI credits per month (~5.6M characters)",
  "Fastest response times",
  "Unlimited Brand DNA profiles",
  "Manage multiple brands in one account",
  "Dedicated priority support"
]'::jsonb
WHERE name = 'pro';
