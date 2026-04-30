import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// Opens a Stripe Customer Portal session so the user can change plan,
// update card, or cancel. Requires the Customer Portal to be configured
// once in the Stripe Dashboard (Settings → Billing → Customer portal).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();
  if (!profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No Stripe customer on file. Subscribe first." },
      { status: 400 }
    );
  }

  const stripe = getStripe();
  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

  const portal = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${origin}/valzacchi-ai`,
  });

  return NextResponse.json({ url: portal.url });
}
