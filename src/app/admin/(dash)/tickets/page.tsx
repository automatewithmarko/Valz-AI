import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/session";
import { adminListTickets } from "@/lib/admin/rpc";
import { TicketsClient } from "@/components/admin/TicketsClient";
import { LoadError } from "@/components/admin/LoadError";
import type { Ticket } from "@/lib/admin/types";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  let tickets: Ticket[] | null = null;
  try {
    tickets = await adminListTickets();
  } catch (err) {
    console.error("tickets load failed", err);
  }

  if (!tickets) return <LoadError what="tickets" />;
  return <TicketsClient initialTickets={tickets} />;
}
