import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { adminCreate, adminDelete, adminGetByEmail, adminList } from "@/lib/admin/rpc";
import { hashPassword, passwordIssue } from "@/lib/admin/password";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
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

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const pwIssue = passwordIssue(password);
  if (pwIssue) {
    return NextResponse.json({ error: pwIssue }, { status: 400 });
  }

  try {
    const existing = await adminGetByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "An admin with that email already exists." },
        { status: 409 }
      );
    }
    const admin = await adminCreate(email, hashPassword(password));
    return NextResponse.json({ admin });
  } catch (err) {
    console.error("admin create failed", err);
    return NextResponse.json({ error: "Failed to create admin." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing admin id." }, { status: 400 });
  }
  if (id === session.sub) {
    return NextResponse.json(
      { error: "You can't remove the account you're signed in with." },
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
