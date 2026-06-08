import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  clearAdminReturnCookie,
  clearImpersonationCookie,
  getAdminReturn,
  getImpersonationSession,
} from "@/lib/admin/impersonation";
import { getServiceClient, hasServiceRole } from "@/lib/admin/service";

// End impersonation: close the audit entry, restore the admin's own Supabase
// session (so they land back in the admin panel rather than logged out), and
// clear the impersonation cookies. If restore isn't possible, the client
// falls back to a full sign-out.
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

  // Restore the admin session by writing their tokens back into the auth
  // cookies (this overwrites the impersonated user's session).
  let restored = false;
  const ret = await getAdminReturn();
  if (ret?.accessToken && ret?.refreshToken) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.setSession({
        access_token: ret.accessToken,
        refresh_token: ret.refreshToken,
      });
      restored = !error && !!data.session;
    } catch (e) {
      console.warn("admin session restore failed", e);
    }
  }

  await clearImpersonationCookie();
  await clearAdminReturnCookie();
  return NextResponse.json({ ok: true, restored });
}
