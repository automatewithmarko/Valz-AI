import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { CREDIT_UNIT_AMOUNT_CENTS, getDbBridgeSecret, getStripe } from "@/lib/stripe";

// Stripe webhook handler. Verifies the signature, then routes the event
// to the right Supabase RPC.
//
// Credits-grant policy:
//   - Granted on `customer.subscription.created` (initial purchase).
//   - Granted on `invoice.payment_succeeded` only when
//     billing_reason === 'subscription_cycle' (monthly renewal).
//   - NOT granted on plan upgrade/downgrade prorations — the user keeps
//     whatever they had and gets the new amount at the next cycle.
//   - One-time credit top-ups are handled in `checkout.session.completed`.

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const sig = req.headers.get("stripe-signature");
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !whSecret) {
    return NextResponse.json(
      { error: "Webhook signature or secret missing" },
      { status: 400 }
    );
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, whSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid signature";
    return NextResponse.json({ error: `Signature verification failed: ${msg}` }, { status: 400 });
  }

  // Route uses an anon-key Supabase client; the writes happen via SECURITY
  // DEFINER RPCs (stripe_set_customer_id / stripe_apply_subscription /
  // stripe_grant_monthly_credits / add_credits) which bypass RLS.
  const supabase = await createClient();

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(supabase, stripe, event.data.object);
        break;
      case "customer.subscription.created":
        await handleSubscription(supabase, event.data.object, { grantCredits: true });
        break;
      case "customer.subscription.updated":
        await handleSubscription(supabase, event.data.object, { grantCredits: false });
        break;
      case "customer.subscription.deleted":
        await handleSubscription(supabase, event.data.object, {
          grantCredits: false,
          forceStatus: "cancelled",
        });
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaid(supabase, event.data.object);
        break;
      case "invoice.payment_failed":
        await handleInvoiceFailed(supabase, event.data.object);
        break;
      default:
        // Ignore other event types (logging would be noisy here).
        break;
    }
  } catch (err) {
    console.error(`webhook ${event.type} failed`, err);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ─── Helpers ─────────────────────────────────────────────────────────

type SB = Awaited<ReturnType<typeof createClient>>;

// Resolve the supabase user_id for a Stripe object. Prefers the
// `supabase_user_id` we attach via metadata at checkout time; falls back
// to a customer-id lookup in the profiles table.
async function resolveUserId(
  supabase: SB,
  metadata: Stripe.Metadata | null | undefined,
  customerId: string | null | undefined
): Promise<string | null> {
  const fromMetadata = metadata?.supabase_user_id;
  if (typeof fromMetadata === "string" && fromMetadata.length > 0) return fromMetadata;
  if (!customerId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();
  return data?.id ?? null;
}

async function findPlanByPriceId(supabase: SB, priceId: string) {
  const { data } = await supabase
    .from("plans")
    .select("id, name, monthly_credits")
    .eq("stripe_price_id", priceId)
    .single();
  return data;
}

async function handleCheckoutCompleted(
  supabase: SB,
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  const userId = await resolveUserId(
    supabase,
    session.metadata,
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null
  );
  if (!userId) {
    console.warn(
      `checkout.session.completed ${session.id}: could not resolve user_id (customer=${
        typeof session.customer === "string" ? session.customer : session.customer?.id ?? "none"
      }, metadata=${JSON.stringify(session.metadata ?? {})})`
    );
    return;
  }

  // Always store the customer id back on the profile so portal/upgrade
  // flows can reuse it.
  if (typeof session.customer === "string") {
    await supabase.rpc("stripe_set_customer_id", {
      p_secret: getDbBridgeSecret(),
      p_user_id: userId,
      p_stripe_customer_id: session.customer,
    });
  }

  // One-time credit top-up. Add credits + log a credit_transaction row.
  if (session.metadata?.kind === "credit_topup") {
    const credits = Number(session.metadata.credits ?? "0");
    if (credits > 0) {
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;
      await supabase.rpc("add_credits", {
        user_uuid: userId,
        credit_amount: credits,
        paid_cents: session.amount_total ?? credits * CREDIT_UNIT_AMOUNT_CENTS,
        payment_intent_id: paymentIntentId ?? undefined,
      });
    }
    return;
  }

  // Subscription checkouts: customer.subscription.created arrives separately
  // with the plan + period info, so do nothing else here.
  void stripe;
}

async function handleSubscription(
  supabase: SB,
  subscription: Stripe.Subscription,
  opts: { grantCredits: boolean; forceStatus?: string }
) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const userId = await resolveUserId(supabase, subscription.metadata, customerId);
  if (!userId) {
    console.warn(`subscription ${subscription.id}: no user_id resolvable`);
    return;
  }

  const item = subscription.items.data[0];
  const priceId = item?.price?.id;
  if (!priceId) {
    console.warn(`subscription ${subscription.id}: no price id on item`);
    return;
  }
  const plan = await findPlanByPriceId(supabase, priceId);
  if (!plan) {
    console.warn(`subscription ${subscription.id}: no plan for price ${priceId}`);
    return;
  }

  const status = opts.forceStatus ?? mapStripeStatus(subscription.status);
  // Stripe types put period bounds on the subscription_item in v17+ APIs.
  const periodStart = item?.current_period_start ?? Math.floor(Date.now() / 1000);
  const periodEnd =
    item?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 24 * 3600;

  const secret = getDbBridgeSecret();
  await supabase.rpc("stripe_apply_subscription", {
    p_secret: secret,
    p_user_id: userId,
    p_plan_id: plan.id,
    p_stripe_subscription_id: subscription.id,
    p_status: status,
    p_current_period_start: new Date(periodStart * 1000).toISOString(),
    p_current_period_end: new Date(periodEnd * 1000).toISOString(),
    p_cancel_at_period_end: subscription.cancel_at_period_end ?? false,
  });

  if (opts.grantCredits) {
    await supabase.rpc("stripe_grant_monthly_credits", {
      p_secret: secret,
      p_user_id: userId,
      p_plan_id: plan.id,
    });
  }
}

async function handleInvoicePaid(supabase: SB, invoice: Stripe.Invoice) {
  // Only top up credits on actual cycle renewals — not on first-purchase
  // invoices (already handled via subscription.created) and not on
  // immediate upgrade prorations.
  if (invoice.billing_reason !== "subscription_cycle") return;

  const subInvoice = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
  };
  const subscriptionId =
    typeof subInvoice.subscription === "string"
      ? subInvoice.subscription
      : subInvoice.subscription?.id ?? null;
  if (!subscriptionId) return;

  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  const userId = await resolveUserId(supabase, invoice.metadata, customerId);
  if (!userId) return;

  // Resolve plan from the invoice line item's price.
  const lineItem = invoice.lines.data[0];
  const linePricing = lineItem as unknown as { price?: { id?: string } };
  const priceId = linePricing.price?.id;
  if (!priceId) return;
  const plan = await findPlanByPriceId(supabase, priceId);
  if (!plan) return;

  await supabase.rpc("stripe_grant_monthly_credits", {
    p_secret: getDbBridgeSecret(),
    p_user_id: userId,
    p_plan_id: plan.id,
  });
}

async function handleInvoiceFailed(supabase: SB, invoice: Stripe.Invoice) {
  const subInvoice = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
  };
  const subscriptionId =
    typeof subInvoice.subscription === "string"
      ? subInvoice.subscription
      : subInvoice.subscription?.id ?? null;
  if (!subscriptionId) return;

  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  const userId = await resolveUserId(supabase, invoice.metadata, customerId);
  if (!userId) return;

  // Pull existing subscription row to keep plan_id + period intact while
  // flipping status to past_due.
  const { data: row } = await supabase
    .from("subscriptions")
    .select("plan_id, current_period_start, current_period_end, cancel_at_period_end")
    .eq("user_id", userId)
    .single();
  if (!row) return;

  await supabase.rpc("stripe_apply_subscription", {
    p_secret: getDbBridgeSecret(),
    p_user_id: userId,
    p_plan_id: row.plan_id,
    p_stripe_subscription_id: subscriptionId,
    p_status: "past_due",
    p_current_period_start: row.current_period_start,
    p_current_period_end: row.current_period_end,
    p_cancel_at_period_end: row.cancel_at_period_end,
  });
}

function mapStripeStatus(s: Stripe.Subscription.Status): string {
  // subscriptions.status check constraint: active | cancelled | past_due | trialing
  switch (s) {
    case "active":
    case "trialing":
    case "past_due":
      return s;
    case "canceled":
      return "cancelled";
    case "incomplete":
    case "incomplete_expired":
    case "unpaid":
    case "paused":
      return "past_due";
    default:
      return "active";
  }
}
