import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  CREDIT_UNIT_AMOUNT_CENTS,
  STRIPE_TOPUP_PRODUCT_ID,
  getDbBridgeSecret,
  getStripe,
} from "@/lib/stripe";

// One-time credit pack purchase via Stripe Embedded Checkout. Returns a
// client_secret that the /checkout/credits page mounts. On success Stripe
// redirects to /checkout/return?session_id=…
const MIN_CREDITS = 50;
const MAX_CREDITS = 5000;
const CREDITS_STEP = 50;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { credits } = (await req.json()) as { credits?: number };
  if (
    !credits ||
    !Number.isInteger(credits) ||
    credits < MIN_CREDITS ||
    credits > MAX_CREDITS ||
    credits % CREDITS_STEP !== 0
  ) {
    return NextResponse.json(
      {
        error: `credits must be an integer between ${MIN_CREDITS} and ${MAX_CREDITS} in steps of ${CREDITS_STEP}`,
      },
      { status: 400 }
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
  const totalCents = credits * CREDIT_UNIT_AMOUNT_CENTS;

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
          unit_amount: totalCents,
          product: STRIPE_TOPUP_PRODUCT_ID,
        },
      },
    ],
    return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    metadata: {
      supabase_user_id: user.id,
      kind: "credit_topup",
      credits: String(credits),
    },
  });

  return NextResponse.json({ clientSecret: session.client_secret });
}
