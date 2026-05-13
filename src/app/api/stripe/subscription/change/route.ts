import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// Custom plan-change endpoint that handles both upgrades and downgrades
// in-app, without bouncing the user out to Stripe Customer Portal.
//
//   Upgrade   — flip the subscription's price immediately with
//               proration_behavior: "always_invoice", so Stripe charges the
//               saved card for the prorated difference (and applies the
//               promo, if any, at the subscription level so it discounts
//               the proration + future invoices for the coupon's duration).
//
//   Downgrade — keep the current plan until current_period_end, then
//               switch to the new plan. Implemented via a Stripe
//               Subscription Schedule with two phases. Promo (if any)
//               attaches to phase 2 so MYAEO100 applies to the first
//               invoice of the lower plan.
//
// The webhook on customer.subscription.updated keeps the Supabase row in
// sync after Stripe completes the change.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { planId?: string; promoCode?: string };
  const planId = body.planId;
  const promoCode = body.promoCode?.trim();
  if (!planId) {
    return NextResponse.json({ error: "planId required" }, { status: 400 });
  }

  const { data: currentSub } = await supabase
    .from("subscriptions")
    .select("plan_id, stripe_subscription_id, current_period_end, plans(price_cents)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!currentSub) {
    return NextResponse.json(
      { error: "No active subscription. Subscribe to a plan first." },
      { status: 400 }
    );
  }
  if (!currentSub.stripe_subscription_id) {
    return NextResponse.json(
      {
        error:
          "This subscription was set up outside Stripe and can't be changed here. Contact support.",
      },
      { status: 400 }
    );
  }
  if (currentSub.plan_id === planId) {
    return NextResponse.json({ error: "Already on this plan." }, { status: 400 });
  }

  const { data: targetPlan } = await supabase
    .from("plans")
    .select("id, name, price_cents, stripe_price_id, display_name")
    .eq("id", planId)
    .single();
  if (!targetPlan?.stripe_price_id) {
    return NextResponse.json(
      { error: "Target plan not found or not configured for Stripe." },
      { status: 404 }
    );
  }

  const currentPriceCents =
    (currentSub.plans as { price_cents: number } | null)?.price_cents ?? 0;
  const isUpgrade = targetPlan.price_cents > currentPriceCents;

  const stripe = getStripe();

  // Resolve promo code → promotion_code id. Stripe's discount params take
  // the promo's id (promo_…), not the human-typed code.
  let promotionCodeId: string | undefined;
  if (promoCode) {
    const promos = await stripe.promotionCodes.list({
      code: promoCode,
      active: true,
      limit: 1,
    });
    if (promos.data.length === 0) {
      return NextResponse.json(
        { error: `Promo code "${promoCode}" not found or inactive.` },
        { status: 400 }
      );
    }
    promotionCodeId = promos.data[0].id;
  }

  const stripeSub = await stripe.subscriptions.retrieve(currentSub.stripe_subscription_id);
  const currentItem = stripeSub.items.data[0];
  if (!currentItem) {
    return NextResponse.json(
      { error: "Existing subscription has no line items." },
      { status: 500 }
    );
  }

  if (isUpgrade) {
    const updated = await stripe.subscriptions.update(
      currentSub.stripe_subscription_id,
      {
        items: [{ id: currentItem.id, price: targetPlan.stripe_price_id }],
        proration_behavior: "always_invoice",
        ...(promotionCodeId
          ? { discounts: [{ promotion_code: promotionCodeId }] }
          : {}),
      }
    );

    return NextResponse.json({
      mode: "upgrade",
      newPlanId: targetPlan.id,
      newPlanDisplayName: targetPlan.display_name,
      stripeSubscriptionId: updated.id,
    });
  }

  // ── Downgrade ────────────────────────────────────────────────────
  // Bind a schedule to the existing subscription, then define two phases:
  // (1) keep current plan until the natural period end, (2) switch to
  // the new plan. Promo, if provided, attaches to phase 2.
  const schedule = await stripe.subscriptionSchedules.create({
    from_subscription: currentSub.stripe_subscription_id,
  });

  const existingPhase = schedule.phases[0];

  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    phases: [
      {
        items: existingPhase.items.map((it) => ({
          price: typeof it.price === "string" ? it.price : it.price.id,
          quantity: it.quantity ?? 1,
        })),
        start_date: existingPhase.start_date,
        end_date: existingPhase.end_date,
      },
      {
        items: [{ price: targetPlan.stripe_price_id, quantity: 1 }],
        ...(promotionCodeId
          ? { discounts: [{ promotion_code: promotionCodeId }] }
          : {}),
      },
    ],
    metadata: {
      supabase_user_id: user.id,
      new_plan_id: targetPlan.id,
      change_type: "downgrade",
    },
  });

  return NextResponse.json({
    mode: "downgrade",
    newPlanId: targetPlan.id,
    newPlanDisplayName: targetPlan.display_name,
    scheduledFor: existingPhase.end_date
      ? new Date(existingPhase.end_date * 1000).toISOString()
      : null,
  });
}
