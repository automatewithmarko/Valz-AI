import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin/access";
import { adminListTickets } from "@/lib/admin/rpc";
import { TicketsClient } from "@/components/admin/TicketsClient";
import { LoadError } from "@/components/admin/LoadError";
import type { Ticket } from "@/lib/admin/types";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/");

  let tickets: Ticket[] | null = null;
  try {
    tickets = await adminListTickets();
  } catch (err) {
    console.error("tickets load failed", err);
  }

  if (!tickets) return <LoadError what="tickets" />;
  return <TicketsClient initialTickets={tickets} />;
}
