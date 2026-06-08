import { NextRequest, NextResponse } from "next/server";
import { adminGetByEmail } from "@/lib/admin/rpc";
import { verifyPassword } from "@/lib/admin/password";
import { setAdminCookie, signSession } from "@/lib/admin/session";

// Best-effort, in-memory brute-force throttle. Resets on server restart;
// good enough for a single-instance admin login.
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(ip, { count: 1, first: now });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_ATTEMPTS;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  // Generic error message either way — don't reveal whether the email exists.
  const invalid = NextResponse.json(
    { error: "Invalid email or password." },
    { status: 401 }
  );

  let admin;
  try {
    admin = await adminGetByEmail(email);
  } catch (err) {
    console.error("admin login lookup failed", err);
    return NextResponse.json({ error: "Login failed. Try again." }, { status: 500 });
  }

  if (!admin || !verifyPassword(password, admin.password_hash)) {
    return invalid;
  }

  const token = signSession({
    sub: admin.id,
    email: admin.email,
    isSuper: admin.is_super,
  });
  await setAdminCookie(token);

  return NextResponse.json({
    ok: true,
    admin: { id: admin.id, email: admin.email, isSuper: admin.is_super },
  });
}
