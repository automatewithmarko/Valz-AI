-- Bridge RPC for the Stripe webhook to record a Brand DNA one-time
-- purchase. Webhook runs under the anon key and can't write directly
-- because RLS on brand_dna_purchases requires auth.uid() = user_id.
CREATE OR REPLACE FUNCTION public.stripe_apply_brand_dna_purchase(
  p_secret text,
  p_user_id uuid,
  p_price_cents integer,
  p_payment_intent_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.app_secret_check('stripe_db_bridge', p_secret);

  INSERT INTO public.brand_dna_purchases (
    user_id, price_cents, status, stripe_payment_intent_id, purchased_at
  ) VALUES (
    p_user_id, p_price_cents, 'active', p_payment_intent_id, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    status = 'active',
    price_cents = EXCLUDED.price_cents,
    stripe_payment_intent_id = COALESCE(EXCLUDED.stripe_payment_intent_id, public.brand_dna_purchases.stripe_payment_intent_id),
    purchased_at = now();
END;
$$;
