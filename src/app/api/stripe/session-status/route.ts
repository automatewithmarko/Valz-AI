import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// Looked up by /checkout/return after Embedded Checkout redirects back.
// We only return the bare session status + a derived "kind" so the UI can
// show the right success copy. The webhook is the source of truth for
// applying credits/subscriptions; this endpoint just confirms payment.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  // Defense in depth: only let a user view sessions tagged with their own
  // supabase_user_id metadata (set when we create the session).
  if (session.metadata?.supabase_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    status: session.status,
    paymentStatus: session.payment_status,
    kind: session.metadata?.kind ?? null,
    customerEmail: session.customer_details?.email ?? null,
  });
}
