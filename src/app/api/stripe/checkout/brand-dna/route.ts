import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDbBridgeSecret, getStripe } from "@/lib/stripe";

// One-time A$97 Aligned Income AI (Brand DNA) purchase via Stripe Embedded
// Checkout. Returns a client_secret that /checkout/brand-dna mounts. On
// success Stripe redirects to /checkout/return?session_id=… and the
// webhook records the purchase.
//
// We use a saved Stripe price (rather than inline price_data) so the
// MYAEO100 coupon, which restricts by product, can apply to this purchase.
const BRAND_DNA_AUD_PRICE_ID = "price_1TZKr5AvuajKo7fO8ZIVQ88X";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // `additional: true` means the user is intentionally buying ANOTHER brand
  // profile (each purchase grants one more slot). Only the FIRST purchase is
  // blocked when one already exists.
  const { additional } = (await req.json().catch(() => ({}))) as {
    additional?: boolean;
  };

  if (!additional) {
    // First-purchase guard: if they already own the Blueprint, don't sell a
    // duplicate first purchase.
    const { data: existing } = await supabase
      .from("brand_dna_purchases")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "Aligned Income AI is already active on your account" },
        { status: 409 }
      );
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, email, full_name")
    .eq("id", user.id)
    .single();

  const stripe = getStripe();

  let customerId = profile?.stripe_customer_id ?? undefined;
  if (!customerId && profile?.email) {
    const customer = await stripe.customers.create(
      {
        email: profile.email,
        name: profile.full_name ?? undefined,
        metadata: { supabase_user_id: user.id },
      },
      { idempotencyKey: `customer-create-${user.id}` }
    );
    customerId = customer.id;
    await supabase.rpc("stripe_set_customer_id", {
      p_secret: getDbBridgeSecret(),
      p_user_id: user.id,
      p_stripe_customer_id: customerId,
    });
  }

  const origin = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, "");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ui_mode: "embedded_page",
    customer: customerId,
    customer_email: customerId ? undefined : profile?.email ?? user.email,
    line_items: [{ price: BRAND_DNA_AUD_PRICE_ID, quantity: 1 }],
    return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    allow_promotion_codes: true,
    metadata: {
      supabase_user_id: user.id,
      kind: "brand_dna",
    },
  });

  return NextResponse.json({ clientSecret: session.client_secret });
}
