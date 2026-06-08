import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supportCreateTicket } from "@/lib/admin/rpc";

// Public endpoint backing the customer support chat bubble. No admin auth —
// anyone can open a ticket — but it's lightly rate-limited and validated.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const submissions = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = submissions.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) {
    submissions.set(ip, { count: 1, first: now });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "You've sent several requests already. Please try again later." },
      { status: 429 }
    );
  }

  let body: { name?: string; email?: string; subject?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim();
  const subject = (body.subject ?? "").trim();
  const message = (body.message ?? "").trim();

  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }
  if (message.length < 5 || message.length > 4000) {
    return NextResponse.json(
      { error: "Please describe your question (at least a few words)." },
      { status: 400 }
    );
  }

  // Best-effort: link the ticket to the signed-in user if there is one.
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  try {
    const ticket = await supportCreateTicket({
      name,
      email,
      subject: subject || null,
      message,
      userId,
    });
    return NextResponse.json({
      ok: true,
      ticketNumber: ticket.ticket_number,
    });
  } catch (err) {
    console.error("support ticket create failed", err);
    return NextResponse.json(
      { error: "Something went wrong creating your ticket. Please try again." },
      { status: 500 }
    );
  }
}
