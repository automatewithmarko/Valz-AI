import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { adminListTickets, adminUpdateTicket } from "@/lib/admin/rpc";
import { TICKET_STATUSES, type TicketStatus } from "@/lib/admin/types";

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const status =
    statusParam && TICKET_STATUSES.includes(statusParam as TicketStatus)
      ? (statusParam as TicketStatus)
      : null;

  try {
    const tickets = await adminListTickets(status);
    return NextResponse.json({ tickets });
  } catch (err) {
    console.error("admin tickets list failed", err);
    return NextResponse.json({ error: "Failed to load tickets." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const id = body.id;
  const status = body.status as TicketStatus | undefined;
  if (!id || !status || !TICKET_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid id or status." }, { status: 400 });
  }
  try {
    await adminUpdateTicket(id, status);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("admin ticket update failed", err);
    return NextResponse.json({ error: "Failed to update ticket." }, { status: 500 });
  }
}
