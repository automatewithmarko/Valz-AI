import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDbBridgeSecret, getStripe } from "@/lib/stripe";

// One-time $97 Aligned Income AI (Brand DNA) purchase via Stripe Embedded
// Checkout. Returns a client_secret that /checkout/brand-dna mounts. On
// success Stripe redirects to /checkout/return?session_id=… and the
// webhook records the purchase.
const BRAND_DNA_PRICE_CENTS = 9700;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // If they already have an active purchase, don't sell them another one.
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
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: BRAND_DNA_PRICE_CENTS,
          product_data: {
            name: "Aligned Income AI",
            description:
              "One-time purchase. Guided discovery for digital product ideas built on your story, skills, and Human Design.",
          },
        },
      },
    ],
    return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    allow_promotion_codes: true,
    metadata: {
      supabase_user_id: user.id,
      kind: "brand_dna",
    },
  });

  return NextResponse.json({ clientSecret: session.client_secret });
}
