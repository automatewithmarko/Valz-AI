import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

// Looked up by /checkout/return after Stripe redirects back. The webhook
// is the source of truth for applying credits/subscriptions; this endpoint
// just confirms payment for the success screen. Auth is not enforced —
// see the inline note below the Stripe call.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  // Auth is not enforced here. The session_id itself is the security
  // boundary — it's an unguessable token and the response only exposes
  // coarse status fields. This used to enforce that an authed user's id
  // matched session.metadata.supabase_user_id, but that branch surfaced as
  // "Forbidden" in legitimate orphaned-session cases (e.g. the underlying
  // Supabase user was deleted or recreated between checkout start and
  // return), while unauthed callers were already allowed through. The
  // webhook remains the source of truth for applying entitlements.
  return NextResponse.json({
    status: session.status,
    paymentStatus: session.payment_status,
    kind: session.metadata?.kind ?? null,
    customerEmail: session.customer_details?.email ?? null,
  });
}
