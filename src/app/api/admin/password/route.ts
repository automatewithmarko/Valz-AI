import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { adminGetById, adminUpdatePassword } from "@/lib/admin/rpc";
import { hashPassword, passwordIssue, verifyPassword } from "@/lib/admin/password";

// Change the signed-in admin's own password.
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";

  const pwIssue = passwordIssue(newPassword);
  if (pwIssue) {
    return NextResponse.json({ error: pwIssue }, { status: 400 });
  }

  try {
    const admin = await adminGetById(session.sub);
    if (!admin) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    if (!verifyPassword(currentPassword, admin.password_hash)) {
      return NextResponse.json(
        { error: "Your current password is incorrect." },
        { status: 400 }
      );
    }
    await adminUpdatePassword(session.sub, hashPassword(newPassword));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("admin password change failed", err);
    return NextResponse.json({ error: "Failed to update password." }, { status: 500 });
  }
}
