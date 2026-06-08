import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { getServiceClient, hasServiceRole } from "@/lib/admin/service";
import { setImpersonationCookie, signImpersonation } from "@/lib/admin/impersonation";

// Start impersonation: mint a one-time magic-link token for the target user
// (via the service role), record an audit entry, and hand the token back to
// the admin's browser, which calls verifyOtp to establish the user session.
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasServiceRole()) {
    return NextResponse.json(
      {
        error:
          "Impersonation isn't configured. Add SUPABASE_SERVICE_ROLE_KEY to the environment and restart.",
      },
      { status: 503 }
    );
  }

  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const userId = body.userId;
  if (!userId) {
    return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  }

  try {
    const service = getServiceClient();

    // Look up the target user's email (service role bypasses RLS).
    const { data: profile, error: profileErr } = await service
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .single();
    if (profileErr || !profile?.email) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    const email = profile.email as string;

    // Generate a magic-link token the admin's browser can redeem.
    const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const props = linkData?.properties as
      | { hashed_token?: string; verification_type?: string }
      | undefined;
    if (linkErr || !props?.hashed_token) {
      console.error("generateLink failed", linkErr);
      return NextResponse.json(
        { error: "Couldn't create a session for that user." },
        { status: 500 }
      );
    }

    // Record the impersonation for auditability.
    let logId = "";
    try {
      const { data: logRow } = await service
        .from("admin_impersonation_log")
        .insert({
          admin_id: session.sub,
          admin_email: session.email,
          user_id: userId,
          user_email: email,
        })
        .select("id")
        .single();
      logId = (logRow?.id as string) ?? "";
    } catch (e) {
      console.warn("impersonation audit insert failed", e);
    }

    // Mark the browser as "in impersonation mode" for the exit banner.
    const cookie = signImpersonation({
      adminId: session.sub,
      adminEmail: session.email,
      userId,
      userEmail: email,
      logId,
    });
    await setImpersonationCookie(cookie);

    return NextResponse.json({
      ok: true,
      tokenHash: props.hashed_token,
      type: props.verification_type ?? "magiclink",
      redirectTo: "/valzacchi-ai",
    });
  } catch (err) {
    console.error("impersonate failed", err);
    return NextResponse.json(
      { error: "Couldn't start impersonation. Please try again." },
      { status: 500 }
    );
  }
}
