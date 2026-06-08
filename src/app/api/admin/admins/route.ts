import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/access";
import {
  adminCreateEmail,
  adminDelete,
  adminGetByEmail,
  adminList,
} from "@/lib/admin/rpc";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const admins = await adminList();
    return NextResponse.json({ admins });
  } catch (err) {
    console.error("admin list failed", err);
    return NextResponse.json({ error: "Failed to load admins." }, { status: 500 });
  }
}

// Invite an admin by email only. They get admin access the next time they
// sign into the main app with that email.
export async function POST(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const existing = await adminGetByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "That email is already an admin." },
        { status: 409 }
      );
    }
    const created = await adminCreateEmail(email);
    return NextResponse.json({ admin: created });
  } catch (err) {
    console.error("admin create failed", err);
    return NextResponse.json({ error: "Failed to add admin." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing admin id." }, { status: 400 });
  }
  if (id === admin.adminId) {
    return NextResponse.json(
      { error: "You can't remove your own admin access." },
      { status: 400 }
    );
  }
  try {
    const removed = await adminDelete(id);
    if (!removed) {
      return NextResponse.json(
        { error: "That admin can't be removed (the primary admin is protected)." },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("admin delete failed", err);
    return NextResponse.json({ error: "Failed to remove admin." }, { status: 500 });
  }
}
