import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDbBridgeSecret, getStripe } from "@/lib/stripe";

// Creates a Stripe Embedded Checkout session for a monthly subscription
// and returns the client_secret. The client mounts <EmbeddedCheckout> with
// it on /checkout/subscription. On success, Stripe redirects to
// `return_url` (/checkout/return?session_id=…) which polls the session
// status to confirm the webhook landed.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { planId } = (await req.json()) as { planId?: string };
  if (!planId) return NextResponse.json({ error: "planId required" }, { status: 400 });

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, name, stripe_price_id, display_name")
    .eq("id", planId)
    .single();
  if (planError || !plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }
  if (!plan.stripe_price_id) {
    return NextResponse.json(
      { error: "Plan is not configured for Stripe checkout (missing stripe_price_id)" },
      { status: 500 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, email, full_name")
    .eq("id", user.id)
    .single();

  const stripe = getStripe();

  // Reuse existing customer when we have one. If not, create one with an
  // idempotency key so a double-click can't produce orphan customers.
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

  // NEXT_PUBLIC_APP_URL may have a trailing slash; strip it so we don't
  // build URLs like https://host.com//checkout/return.
  const origin = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, "");

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ui_mode: "embedded_page",
    customer: customerId,
    customer_email: customerId ? undefined : profile?.email ?? user.email,
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { supabase_user_id: user.id, plan_id: plan.id, plan_name: plan.name },
    },
    metadata: { supabase_user_id: user.id, plan_id: plan.id, kind: "subscription" },
  });

  return NextResponse.json({ clientSecret: session.client_secret });
}
