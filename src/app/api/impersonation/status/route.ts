import { NextResponse } from "next/server";
import { getImpersonationSession } from "@/lib/admin/impersonation";

// Read by the app-wide banner to know whether to show the "exit
// impersonation" bar. Only reveals data to the browser that holds the
// (httpOnly, signed) impersonation cookie.
export async function GET() {
  const session = await getImpersonationSession();
  if (!session) {
    return NextResponse.json({ active: false });
  }
  return NextResponse.json({
    active: true,
    userEmail: session.userEmail,
    adminEmail: session.adminEmail,
  });
}
