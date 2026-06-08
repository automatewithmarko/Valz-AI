import { NextResponse } from "next/server";
import {
  clearImpersonationCookie,
  getImpersonationSession,
} from "@/lib/admin/impersonation";
import { getServiceClient, hasServiceRole } from "@/lib/admin/service";

// End impersonation: close the audit entry and clear the marker cookie. The
// actual Supabase sign-out happens client-side in the banner.
export async function POST() {
  const session = await getImpersonationSession();

  if (session?.logId && hasServiceRole()) {
    try {
      await getServiceClient()
        .from("admin_impersonation_log")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", session.logId);
    } catch (e) {
      console.warn("impersonation audit close failed", e);
    }
  }

  await clearImpersonationCookie();
  return NextResponse.json({ ok: true });
}
