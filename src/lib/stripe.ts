import Stripe from "stripe";

let _client: Stripe | null = null;

/** Server-side Stripe client. Lazy so importing this module never throws. */
export function getStripe(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  _client = new Stripe(key);
  return _client;
}

export const STRIPE_TOPUP_PRODUCT_ID = "prod_UQgrf8wQvxDBo8";
export const CREDIT_UNIT_AMOUNT_CENTS = 10; // $0.10 per credit

/**
 * Shared secret for the SECURITY DEFINER stripe_* RPCs. The webhook +
 * checkout routes must pass this as the first arg of every Stripe DB
 * bridge call. Throws if missing — anyone calling the RPC without a
 * matching secret gets rejected by app_secret_check().
 */
export function getDbBridgeSecret(): string {
  const s = process.env.STRIPE_DB_BRIDGE_SECRET;
  if (!s) throw new Error("STRIPE_DB_BRIDGE_SECRET is not set");
  return s;
}
