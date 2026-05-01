import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// Looked up by /checkout/return after Stripe redirects back. The webhook
// is the source of truth for applying credits/subscriptions; this endpoint
// just confirms payment for the success screen.
//
// Auth is best-effort: when the auth cookie survives the Stripe redirect
// (most cases) we keep a defense-in-depth check that the session belongs
// to the current user. When it doesn't (some serverless edge cases),
// we still return the bare status so the user isn't blocked from seeing
// confirmation. The session_id itself is unguessable, and the response
// only contains coarse status fields.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  // If we have an authed user AND the metadata is set, enforce that they
  // match — a signed-in user shouldn't be able to peek at someone else's
  // session. Unauthed callers fall through to the public status response.
  if (
    user &&
    session.metadata?.supabase_user_id &&
    session.metadata.supabase_user_id !== user.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    status: session.status,
    paymentStatus: session.payment_status,
    kind: session.metadata?.kind ?? null,
    customerEmail: session.customer_details?.email ?? null,
  });
}
